import { useEffect, useRef, useState } from 'react'
import { makeBook, type FoliateView, type Location, type Tts } from 'foliate-js/view.js'
import 'foliate-js/view.js' // side effect: defines the <foliate-view> custom element
import { textWalker } from 'foliate-js/text-walker.js'
import { getBook, getProgress, putProgress, type Flow, type SettingsRecord } from '../library/db'
import { attachClickZones, attachKeys, type InteractionHandlers } from './interactions'
import { highlightSpokenRange, injectTheme } from './theme-inject'

const SAVE_DEBOUNCE_MS = 500

// Trap #1: these attributes belong on the renderer, not the view --
// `view.setAttribute(...)` (what foliate-js's own README shows) is a
// silent no-op, because View doesn't forward attributes to Paginator.
//
// flow/max-column-count are the two the settings panel changes at
// runtime; paginator.js's attributeChangedCallback re-renders on both, so
// no re-init is needed to switch layout mid-book.
export function applyLayout(view: FoliateView, flow: Flow, columns: 1 | 2): void {
  view.renderer.setAttribute('flow', flow)
  view.renderer.setAttribute('max-column-count', String(columns))
}

function setLayout(view: FoliateView) {
  view.renderer.setAttribute('max-inline-size', '720')
  view.renderer.setAttribute('gap', '7')
  view.renderer.setAttribute('margin', '48')
  applyLayout(view, 'paginated', 2)
}

/**
 * Initializes `view.tts` for whatever section is currently loaded, and
 * returns it once ready. Re-initializing for the same document would reset
 * the block cursor back to the top of the chapter, so -- exactly as
 * view.initTTS does -- this no-ops when the doc is unchanged. That makes it
 * safe to call redundantly (once from the `load` listener below to pre-warm,
 * once from driver.ts after advancing a section); whichever gets there first
 * does the real work.
 *
 * This function exists because `view.next()` resolving does NOT mean
 * `view.tts` has been reinitialized for the new section: the `load`
 * listener's call here is fired-and-forgotten, not awaited by `next()`.
 * Anything needing `view.tts` to be current for the section it just
 * navigated to must await this instead of assuming so.
 *
 * We construct TTS directly rather than calling `view.initTTS()`, which
 * accepts granularity only and hardcodes `scrollToAnchor(range, true)` as
 * its highlight callback -- discarding ours. That cost us both the accent
 * underline and, because `select: true` leaves a live DOM selection on every
 * spoken sentence, click-to-turn-page inside the book while TTS runs.
 */
export async function ensureTts(view: FoliateView): Promise<Tts> {
  const doc = view.renderer.getContents()[0]?.doc
  if (view.tts && view.tts.doc === doc) return view.tts
  // tts.js stays dynamic (view.js only pulls it in lazily too); text-walker.js
  // is statically imported by view.js already, so deferring it buys nothing.
  const { TTS } = await import('foliate-js/tts.js')
  view.tts = new TTS(
    doc,
    textWalker,
    range => {
      highlightSpokenRange(range)
      // Trap #2: the page follows the voice via scrollToAnchor here, not
      // view.next() -- one code path for paginated and scrolled. `select`
      // stays false: the underline is ours to draw, and a real selection
      // would suppress click-to-turn-page for the whole session.
      view.renderer.scrollToAnchor(range, false)
    },
    'sentence',
  )
  return view.tts
}

/**
 * Owns the <foliate-view> element for one book: creates it once per
 * bookId (trap #6 -- React must never re-render this element, so it's
 * built imperatively in an effect, not JSX), wires theme injection and
 * TTS pre-warming to `load`, and debounces `relocate` into IndexedDB.
 */
export function useFoliate(
  bookId: string,
  handlers: InteractionHandlers = {},
  settings: SettingsRecord | null = null,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<FoliateView | null>(null)
  // `view`'s identity never changes as the reader turns pages -- only its
  // internal lastLocation mutates -- so anything that needs to redraw on
  // navigation (the rail) needs this as actual React state instead.
  const [location, setLocation] = useState<Location | null>(null)
  // Indirected through a ref so the 'load' listener (created once per
  // bookId, not per render) always calls the latest handlers instead of
  // whichever ones existed when that listener was attached.
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    let cancelled = false
    const el = document.createElement('foliate-view') as FoliateView
    let saveTimer: ReturnType<typeof setTimeout> | undefined

    el.addEventListener('load', ((e: CustomEvent<{ doc: Document; index: number }>) => {
      injectTheme(e.detail.doc)
      // Trap #5: pre-warm on `load`, never inside the play click handler --
      // initTTS is async (dynamic import) and iOS requires the first
      // speak() to happen synchronously inside a user gesture.
      void ensureTts(el)
      // The section doc is same-origin but a new browsing context, so
      // clicks/keys/mousemove inside it never bubble to the parent window --
      // attach navigation and idle-activity handling directly on it.
      const forward = {
        onActivity: () => handlersRef.current.onActivity?.(),
        onMiddleTap: () => handlersRef.current.onMiddleTap?.(),
      }
      attachKeys(el, e.detail.doc, forward)
      attachClickZones(el, e.detail.doc, forward)
    }) as EventListener)

    el.addEventListener('relocate', ((e: CustomEvent<Location>) => {
      const loc = e.detail
      setLocation(loc) // UI (the rail) updates immediately; the DB write below is debounced
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        void putProgress({
          bookId,
          cfi: loc.cfi,
          fraction: loc.fraction,
          updatedAt: Date.now(),
        })
      }, SAVE_DEBOUNCE_MS)
    }) as EventListener)

    async function boot() {
      const record = await getBook(bookId)
      if (!record || cancelled) return
      const book = await makeBook(record.file)
      if (cancelled) return

      containerRef.current?.append(el)
      await el.open(book)
      if (cancelled) return
      setLayout(el)

      const progress = await getProgress(bookId)
      if (cancelled) return
      await el.init({ lastLocation: progress?.cfi })
      if (cancelled) return
      setView(el)
    }
    void boot()

    return () => {
      cancelled = true
      clearTimeout(saveTimer)
      speechSynthesis.cancel()
      el.close()
      el.remove()
      setView(null)
      setLocation(null)
    }
  }, [bookId])

  // Re-applies the layout settings whenever they change -- setAttribute
  // alone re-renders the current view live, no re-init needed (see
  // applyLayout's comment).
  useEffect(() => {
    if (!view || !settings) return
    applyLayout(view, settings.flow, settings.columns)
  }, [view, settings?.flow, settings?.columns])

  // Re-injects theme/font/scale/line-height into whatever section doc is
  // currently loaded. `injectTheme` reads the resolved values itself (via
  // getComputedStyle on the outer root, which useSettings keeps current),
  // so this effect only needs to know *that* an appearance setting
  // changed, not what changed -- and only needs to run for the section(s)
  // already on screen; newly loaded sections pick it up from the `load`
  // listener above.
  useEffect(() => {
    if (!view || !settings) return
    for (const content of view.renderer.getContents()) injectTheme(content.doc)
  }, [view, settings?.themeId, settings?.fontFamily, settings?.fontScale, settings?.lineHeight])

  return { view, location, containerRef }
}
