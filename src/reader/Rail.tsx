import type { MouseEvent as ReactMouseEvent } from 'react'
import type { FoliateView, Location } from 'foliate-js/view.js'
import './Rail.css'

/**
 * The reading rail: chapter progress as a fill, click to jump. Doubles as
 * the TTS position indicator during playback, since scrollToAnchor (see
 * useFoliate's ensureTts) already keeps the page -- and so this fraction
 * -- in sync with the spoken sentence. A visually separate TTS playhead
 * segment was in the original design; this single fill covers the same
 * signal with far less code, so it's deferred rather than built blind.
 */
export function Rail({ view, location }: { view: FoliateView; location: Location | null }) {
  const fraction = location?.fraction ?? 0

  function handleClick(e: ReactMouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const f = (e.clientY - rect.top) / rect.height
    void view.goToFraction(Math.min(1, Math.max(0, f)))
  }

  return (
    <div className="rail" onClick={handleClick}>
      <div className="rail__fill" style={{ height: `${fraction * 100}%` }} />
    </div>
  )
}
