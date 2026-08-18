import { useEffect, useRef, useState } from 'react'
import { makeBook, type Book, type FoliateView, type Location, type TocItem, type Tts } from 'foliate-js/view.js'
import 'foliate-js/view.js' // side effect: defines the <foliate-view> custom element
import { Overlayer } from 'foliate-js/overlayer.js'
import { textWalker } from 'foliate-js/text-walker.js'
import { getBook, getProgress, putProgress, type AnnotationRecord, type Flow, type SettingsRecord } from '../library/db'
import { attachClickZones, attachKeys, attachSelection, type InteractionHandlers } from './interactions'
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

// Trap #7: these values need real CSS units. paginator.js's shadow
// stylesheet computes grid-template-columns/-rows via calc() against the
// custom properties these attributes feed -- calc(720 * 2) is invalid, so
// a unitless '720' voids the whole grid while parseFloat('720') (the JS
// half, for column-width/gap math) stays happy. No error, just a book
// that renders in an implicit auto-sized row. See CLAUDE.md.
function bookMargin(): number {
  return Math.round(Math.min(56, Math.max(24, window.innerHeight * 0.05)))
}

function setLayout(view: FoliateView) {
  view.renderer.setAttribute('max-inline-size', '720px')
  view.renderer.setAttribute('gap', '7%')
  view.renderer.setAttribute('margin', `${bookMargin()}px`)
  applyLayout(view, 'paginated', 2)
}

function flattenToc(items: TocItem[]): TocItem[] {
  return items.flatMap(item => [item, ...flattenToc(item.subitems ?? [])])
}

/**
 * Real EPUBs (checked against an actual multi-chapter-per-file book, not
 * assumed) mark a chapter start with an *empty* anchor immediately before
 * the heading -- `<p><a id="p2"></a><b>DREAMS OF DESTINY</b></p>` -- and
 * `<a>` is inline. `break-before` only applies to block-level boxes (CSS
 * Fragmentation), so setting it on the anchor itself is a silent no-op --
 * exactly the failure mode this codebase keeps running into with foliate-js,
 * just self-inflicted this time. Deliberately not resolved via
 * `getComputedStyle`: this runs inside the section iframe's `load` handler,
 * before the library makes that iframe visible again (its own comment a few
 * lines down its source flags computed-style reads as unreliable there,
 * for exactly that reason) -- a purely structural check sidesteps it. An
 * anchor with real text content (the id placed directly on the heading
 * instead) is left alone; it's already block-level.
 */
function chapterBreakTarget(el: HTMLElement): HTMLElement {
  const parent = el.parentElement
  if (!el.textContent?.trim() && parent && parent.tagName !== 'BODY') return parent
  return el
}

/**
 * Forces every chapter heading the book's own TOC points to (via a
 * fragment into this section) to start a fresh column, instead of running
 * on mid-page -- the only signal a book that packs several chapters into
 * one XHTML file gives us. paginator.js has no page-spread/parity concept
 * at all -- not even for whole spine items (fixed-layout.js is the only
 * foliate-js renderer that reads EPUB3's own `section.pageSpread`) -- so
 * this can only guarantee a fresh column, never specifically the left
 * half of a two-page spread. A no-op for TOC entries pointing at a
 * section's own start (no fragment -- resolveHref's anchor is the bare
 * number 0, not an Element) or at a different section entirely.
 *
 * Also tags the same element `sb-chapter-title` -- theme-inject.ts styles
 * that class in its own display face, distinct from the running body
 * text. Deliberately scoped to only what the TOC anchors resolve to a
 * real element: a book whose TOC links have no fragment at all (rare --
 * usually only when every chapter is already its own spine item) gets
 * neither the break nor the heading styling, rather than guessing which
 * element is "the heading" from tag names alone, which real (especially
 * auto-converted) books don't mark reliably -- see chapterBreakTarget.
 */
function markChapterStarts(book: Book, doc: Document, index: number): void {
  for (const item of flattenToc(book.toc ?? [])) {
    const resolved = book.resolveHref(item.href)
    if (resolved?.index !== index) continue
    // Not `instanceof HTMLElement`: `doc` is the section iframe's document,
    // a separate realm, so its elements aren't instances of this window's
    // HTMLElement (the trap CLAUDE.md already documents for interactions.ts).
    // `typeof` is realm-independent and is enough to rule out the other two
    // possible returns (the bare number 0, and null).
    const el = resolved.anchor(doc)
    if (!el || typeof el !== 'object') continue
    const target = chapterBreakTarget(el)
    target.style.setProperty('break-before', 'column')
    target.classList.add('sb-chapter-title')
  }
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
  annotations: AnnotationRecord[] = [],
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
  // Same indirection, for the same reason: 'create-overlay' is attached once
  // per bookId, in boot() below, well before this ever has a real list in it.
  const annotationsRef = useRef(annotations)
  useEffect(() => {
    annotationsRef.current = annotations
  })

  useEffect(() => {
    let cancelled = false
    const el = document.createElement('foliate-view') as FoliateView
    let saveTimer: ReturnType<typeof setTimeout> | undefined

    el.addEventListener('load', ((e: CustomEvent<{ doc: Document; index: number }>) => {
      injectTheme(e.detail.doc)
      markChapterStarts(el.book, e.detail.doc, e.detail.index)
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
      attachSelection(e.detail.doc, selection => handlersRef.current.onSelection?.(selection, e.detail.index))
    }) as EventListener)

    // Trap: only search results get redrawn on section reload
    // (view.js's #createOverlayer re-adds *its own* search matches, not
    // ours) -- so persisted highlights vanish on navigation unless we
    // redraw them ourselves here. addAnnotation no-ops for a CFI whose
    // section isn't the one that was just (re)created, so it's safe/cheap
    // to offer the whole list on every fire rather than filter by index
    // first.
    el.addEventListener('create-overlay', (() => {
      for (const a of annotationsRef.current) void el.addAnnotation({ value: a.cfi, color: a.color })
    }) as EventListener)

    el.addEventListener('draw-annotation', ((
      e: CustomEvent<{
        draw: (drawFn: typeof Overlayer.highlight, opts: { color: string }) => void
        annotation: { color: string }
      }>,
    ) => {
      e.detail.draw(Overlayer.highlight, { color: e.detail.annotation.color })
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

  // Keeps the margin viewport-relative as the window resizes/rotates.
  // The clamp in bookMargin() is its own debounce (most resizes don't
  // cross a clamp boundary), and the paginator's own ResizeObserver
  // already re-renders on size change -- this effect exists solely to
  // keep the margin *value* current, not to trigger a re-render itself.
  useEffect(() => {
    if (!view) return
    const renderer = view.renderer
    let last = bookMargin()
    function onResize() {
      const next = bookMargin()
      if (next === last) return
      last = next
      renderer.setAttribute('margin', `${next}px`)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [view])

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
