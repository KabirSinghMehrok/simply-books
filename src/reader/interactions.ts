import type { FoliateView } from 'foliate-js/view.js'

export interface InteractionHandlers {
  /** Any pointer movement, click, or keypress in the book -- resets the chrome idle timer. */
  onActivity?: () => void
  /** A tap in the middle third of the page (not a left/right nav zone) -- toggles chrome. */
  onMiddleTap?: () => void
  /** A non-empty text selection appeared/changed/cleared in this section. */
  onSelection?: (selection: SelectionInfo | null, index: number) => void
}

export interface SelectionInfo {
  range: Range
  /** Viewport-relative bounding rect of the selection, corrected for the iframe offset. */
  rect: { left: number; top: number; right: number; bottom: number }
}

/**
 * A section's iframe is as wide as its whole column strip in paginated mode
 * (7680px for a long chapter) but positioned as a normal viewport-sized
 * element -- so a rect measured inside it (getBoundingClientRect,
 * getClientRects) needs the iframe's own on-screen offset added before it
 * means anything in the outer page's coordinate space. `frameElement` is
 * null when `doc` is the outer document itself, in which case there's
 * nothing to correct.
 */
export function frameOffset(doc: Document): { dx: number; dy: number } {
  const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
  return { dx: frame?.left ?? 0, dy: frame?.top ?? 0 }
}

/**
 * Keyboard paging and activity detection.
 *
 * Attach to the outer window, so the keys still work while a chrome control
 * has focus, and to every section document -- the book's iframe is
 * same-origin but a separate browsing context, so its events never bubble
 * out to the parent window.
 */
export function attachKeys(
  view: FoliateView,
  target: Document | Window,
  handlers: InteractionHandlers,
): () => void {
  const controller = new AbortController()
  const { signal } = controller

  target.addEventListener('mousemove', () => handlers.onActivity?.(), { signal })

  target.addEventListener(
    'keydown',
    event => {
      const e = event as KeyboardEvent
      handlers.onActivity?.()
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        void view.goLeft()
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        void view.goRight()
      }
    },
    { signal },
  )

  return () => controller.abort()
}

/**
 * Click-zone paging: the left third goes back, the right third forward, and
 * the middle toggles the chrome.
 *
 * Attach this ONLY to the book itself -- the container holding
 * <foliate-view>, plus each section document. Never to the window.
 *
 * The scoping is the whole point. The chrome bars, the rail and the TOC are
 * siblings of that container, so a listener here simply never sees their
 * clicks. The obvious alternative -- one window listener that ignores events
 * whose target sits inside the chrome -- looks equivalent and is not: React
 * can replace the clicked node during the click's own dispatch (play and
 * pause are different components, so the icon is a different element), and a
 * bubble-phase listener then receives a target already detached from the
 * document, whose .closest() matches nothing. Pressing pause turned the page
 * back for exactly that reason.
 *
 * Swipe needs no handling: paginator.js attaches its own touch listeners to
 * every section document.
 */
export function attachClickZones(
  view: FoliateView,
  target: Document | HTMLElement,
  handlers: InteractionHandlers,
): () => void {
  const controller = new AbortController()
  const { signal } = controller
  // Realm-safe and instanceof-free: an element's ownerDocument is its
  // document, a Document's ownerDocument is null, so this resolves both.
  const doc: Document = target.ownerDocument ?? (target as Document)

  target.addEventListener(
    'click',
    event => {
      const e = event as MouseEvent
      handlers.onActivity?.()
      // Duck-typed rather than `instanceof Element`: nodes inside the book
      // belong to the iframe's realm and fail an instanceof check here.
      const el = e.target as Element | null
      if (el?.closest?.('a')) return
      if (doc.getSelection()?.toString()) return

      // A paginated section's iframe spans the entire column strip -- 7680px
      // for a long chapter -- so its own innerWidth would drop every click
      // into the "left third". Convert to viewport coordinates and split the
      // visible page instead. frameOffset is 0 when this is attached to the
      // container, where clientX is already viewport-relative.
      const x = e.clientX + frameOffset(doc).dx
      const width = window.innerWidth
      if (x < width / 3) void view.goLeft()
      else if (x > (width * 2) / 3) void view.goRight()
      else handlers.onMiddleTap?.()
    },
    { signal },
  )

  return () => controller.abort()
}

/**
 * Reports the current text selection inside one section document, or `null`
 * once it's cleared. `selectionchange` fires on the Document that owns the
 * selection, not the window -- same cross-realm reason as everything else
 * here -- so this is attached per-section-doc from useFoliate's `load`
 * listener, never once on the outer window. `pointerup` is a second trigger
 * alongside it: it's the point a drag-to-select gesture actually finishes,
 * and it's what still fires if `selectionchange` support is flaky for a
 * given interaction (e.g. selecting via double/triple-click).
 */
export function attachSelection(
  doc: Document,
  onSelection: (selection: SelectionInfo | null) => void,
): () => void {
  const controller = new AbortController()
  const { signal } = controller

  function report() {
    const sel = doc.getSelection()
    const text = sel?.toString()
    if (!sel || sel.rangeCount === 0 || !text) {
      onSelection(null)
      return
    }
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const { dx, dy } = frameOffset(doc)
    onSelection({
      range,
      rect: { left: rect.left + dx, top: rect.top + dy, right: rect.right + dx, bottom: rect.bottom + dy },
    })
  }

  doc.addEventListener('selectionchange', report, { signal })
  doc.addEventListener('pointerup', report, { signal })
  return () => controller.abort()
}
