import type { FoliateView } from 'foliate-js/view.js'

export interface InteractionHandlers {
  /** Any pointer movement, click, or keypress in the book -- resets the chrome idle timer. */
  onActivity?: () => void
  /** A tap in the middle third of the page (not a left/right nav zone) -- toggles chrome. */
  onMiddleTap?: () => void
}

/**
 * Wires click-zone navigation, ArrowLeft/ArrowRight/Space paging, and
 * activity detection onto one event target. Needed twice -- once for the
 * outer `window` (chrome has focus) and once per section document
 * (the book's iframe is same-origin but events inside it never bubble
 * to the parent) -- so the logic lives once here instead of twice.
 *
 * Swipe-to-turn-page is not handled here: paginator.js already attaches
 * its own touchstart/touchmove/touchend listeners to every section doc.
 */
export function attachInteractions(
  view: FoliateView,
  target: Document | Window,
  handlers: InteractionHandlers,
): () => void {
  const controller = new AbortController()
  const { signal } = controller
  const doc = target instanceof Document ? target : target.document

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

  target.addEventListener(
    'click',
    event => {
      const e = event as MouseEvent
      handlers.onActivity?.()
      if (e.target instanceof Element && e.target.closest('a')) return
      if (doc.getSelection()?.toString()) return

      const width = (doc.defaultView ?? window).innerWidth
      if (e.clientX < width / 3) void view.goLeft()
      else if (e.clientX > (width * 2) / 3) void view.goRight()
      else handlers.onMiddleTap?.()
    },
    { signal },
  )

  return () => controller.abort()
}
