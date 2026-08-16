import { useEffect, useRef, useState } from 'react'
import { makeBook, type FoliateView, type Location, type Tts } from 'foliate-js/view.js'
import 'foliate-js/view.js' // side effect: defines the <foliate-view> custom element
import { getBook, getProgress, putProgress } from '../library/db'
import { highlightSpokenRange, injectTheme } from './theme-inject'

const SAVE_DEBOUNCE_MS = 500

// Trap #1: these attributes belong on the renderer, not the view --
// `view.setAttribute(...)` (what foliate-js's own README shows) is a
// silent no-op, because View doesn't forward attributes to Paginator.
function setLayout(view: FoliateView) {
  view.renderer.setAttribute('flow', 'paginated')
  view.renderer.setAttribute('max-column-count', '2')
  view.renderer.setAttribute('max-inline-size', '720')
  view.renderer.setAttribute('gap', '7')
  view.renderer.setAttribute('margin', '48')
}

/**
 * Initializes `view.tts` for whatever section is currently loaded, and
 * returns it once ready. initTTS no-ops if the doc hasn't changed, so
 * calling this redundantly (once from the `load` listener below to
 * pre-warm, once from driver.ts after advancing a section) is safe --
 * whichever call gets there first does the real work.
 *
 * This function exists because `view.next()` resolving does NOT mean
 * `view.tts` has been reinitialized for the new section: the `load`
 * listener's initTTS call is fired-and-forgotten, not awaited by
 * `next()`. Anything that needs `view.tts` to be current for the
 * section it just navigated to must await this instead of assuming so.
 */
export async function ensureTts(view: FoliateView): Promise<Tts> {
  await view.initTTS('sentence', range => {
    highlightSpokenRange(range)
    // Trap #2: the page follows the voice via scrollToAnchor here,
    // not view.next() -- one code path for paginated and scrolled.
    view.renderer.scrollToAnchor(range, false)
  })
  return view.tts!
}

/**
 * Owns the <foliate-view> element for one book: creates it once per
 * bookId (trap #6 -- React must never re-render this element, so it's
 * built imperatively in an effect, not JSX), wires theme injection and
 * TTS pre-warming to `load`, and debounces `relocate` into IndexedDB.
 */
export function useFoliate(bookId: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<FoliateView | null>(null)

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
    }) as EventListener)

    el.addEventListener('relocate', ((e: CustomEvent<Location>) => {
      const location = e.detail
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        void putProgress({
          bookId,
          cfi: location.cfi,
          fraction: location.fraction,
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
    }
  }, [bookId])

  return { view, containerRef }
}
