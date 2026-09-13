import type { ReactNode } from 'react'
import { Highlighter, List, Pause, Play, RotateCcw, Search, Settings, SkipBack, SkipForward, X } from 'lucide-react'
import type { FoliateView } from 'foliate-js/view.js'
import type { useTtsDriver } from '../tts/driver'
import { flatten } from '../library/meta'
import './Chrome.css'

interface ChromeProps {
  view: FoliateView
  tts: ReturnType<typeof useTtsDriver>
  visible: boolean
  /** Below MOBILE_BREAKPOINT (Reader.tsx): two bars, three thumb-reachable
   * corners. Above it: one bar, everything reachable either way. */
  isMobile: boolean
  onToggleToc: () => void
  onToggleHighlights: () => void
  onToggleSearch: () => void
  onClose: () => void
}

export function Chrome({
  view,
  tts,
  visible,
  isMobile,
  onToggleToc,
  onToggleHighlights,
  onToggleSearch,
  onClose,
}: ChromeProps) {
  const title = flatten(view.book.metadata.title) || 'Untitled'

  const navGroup = (
    <>
      <button className="chrome__icon" onClick={onToggleToc} aria-label="Contents">
        <List size={18} />
      </button>
      <button className="chrome__icon" onClick={onToggleHighlights} aria-label="Highlights and notes">
        <Highlighter size={18} />
      </button>
    </>
  )

  const playbackGroup = (
    <>
      <button className="chrome__icon" onClick={tts.prevSentence} aria-label="Previous sentence">
        <SkipBack size={18} />
      </button>
      <button
        className="chrome__icon chrome__play"
        onClick={tts.status === 'playing' ? tts.pause : tts.play}
        aria-label={tts.status === 'playing' ? 'Pause' : 'Play'}
      >
        {tts.status === 'playing' ? <Pause size={20} /> : <Play size={20} />}
      </button>
      <button className="chrome__icon" onClick={tts.nextSentence} aria-label="Next sentence">
        <SkipForward size={18} />
      </button>
      <button className="chrome__icon" onClick={tts.readThisPage} aria-label="Read this page">
        <RotateCcw size={18} />
      </button>
    </>
  )

  const utilityGroup = (
    <>
      <button className="chrome__icon" onClick={onToggleSearch} aria-label="Search in book">
        <Search size={18} />
      </button>
      <button className="chrome__icon" popoverTarget="settings-panel" aria-label="Settings">
        <Settings size={18} />
      </button>
    </>
  )

  const closeButton = (
    <button className="chrome__icon" onClick={onClose} aria-label="Back to library">
      <X size={18} />
    </button>
  )

  const group = (content: ReactNode, extraClass?: string) => (
    <div className={`chrome__group${extraClass ? ` ${extraClass}` : ''}`}>{content}</div>
  )

  return (
    <div className={`chrome${visible ? '' : ' chrome--hidden'}`}>
      {isMobile ? (
        <>
          <div className="chrome__bar chrome__top">
            <div className="chrome__title">{title}</div>
            {closeButton}
          </div>
          <div className="chrome__bar chrome__bottom">
            {group(navGroup)}
            {group(playbackGroup, 'chrome__group--playback')}
            {group(utilityGroup)}
          </div>
        </>
      ) : (
        <div className="chrome__bar chrome__top chrome__top--laptop">
          {group(navGroup)}
          <div className="chrome__title">{title}</div>
          <div className="chrome__group chrome__group--right">
            {group(playbackGroup, 'chrome__group--playback')}
            {utilityGroup}
            {closeButton}
          </div>
        </div>
      )}
    </div>
  )
}
