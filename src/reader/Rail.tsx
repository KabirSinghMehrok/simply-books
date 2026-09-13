import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import type { FoliateView, Location } from 'foliate-js/view.js'
import './Rail.css'

/**
 * The reading rail: chapter progress as a fill, click to jump. Doubles as
 * the TTS position indicator during playback, since scrollToAnchor (see
 * useFoliate's ensureTts) already keeps the page -- and so this fraction
 * -- in sync with the spoken sentence. A visually separate TTS playhead
 * segment was in the original design; this single fill covers the same
 * signal with far less code, so it's deferred rather than built blind.
 *
 * Mobile is a horizontal line above the bottom bar (thumb-reachable, and
 * out of the one-handed dead zone the rest of Chrome.tsx's split avoids);
 * laptop keeps the vertical strip along the right edge. Same fraction, same
 * click math either way -- only the axis differs, so it's carried as one
 * `--fraction` custom property and Rail.css decides whether that drives
 * width or height per mode, instead of branching the inline style here.
 */
export function Rail({
  view,
  location,
  isMobile,
}: {
  view: FoliateView
  location: Location | null
  isMobile: boolean
}) {
  const fraction = location?.fraction ?? 0

  function handleClick(e: ReactMouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const f = isMobile ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height
    void view.goToFraction(Math.min(1, Math.max(0, f)))
  }

  return (
    <div
      className={`rail${isMobile ? ' rail--horizontal' : ''}`}
      onClick={handleClick}
      style={{ '--fraction': fraction } as CSSProperties}
    >
      <div className="rail__fill" />
    </div>
  )
}
