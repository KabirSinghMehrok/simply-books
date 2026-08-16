import { List, Pause, Play, RotateCcw, Settings, SkipBack, SkipForward, X } from 'lucide-react'
import type { FoliateView } from 'foliate-js/view.js'
import type { useTtsDriver } from '../tts/driver'
import { flatten } from '../library/meta'
import './Chrome.css'

interface ChromeProps {
  view: FoliateView
  tts: ReturnType<typeof useTtsDriver>
  visible: boolean
  onToggleToc: () => void
  onClose: () => void
}

export function Chrome({ view, tts, visible, onToggleToc, onClose }: ChromeProps) {
  const title = flatten(view.book.metadata.title) || 'Untitled'
  // The natural voice can't speak before its one-time download finishes --
  // and piper-engine.ts's own backstop aside, the button simply shouldn't
  // offer to start it.
  const playDisabled = tts.engine === 'natural' && tts.piperDownload.status !== 'ready'

  return (
    <div className={`chrome${visible ? '' : ' chrome--hidden'}`}>
      <div className="chrome__bar chrome__top">
        <button className="chrome__icon" onClick={onToggleToc} aria-label="Contents">
          <List size={18} />
        </button>
        <div className="chrome__title">{title}</div>
        <button className="chrome__icon" onClick={onClose} aria-label="Back to library">
          <X size={18} />
        </button>
      </div>

      <div className="chrome__bar chrome__tts">
        <button className="chrome__icon" onClick={tts.prevSentence} aria-label="Previous sentence">
          <SkipBack size={18} />
        </button>
        <button
          className="chrome__icon chrome__play"
          onClick={tts.status === 'playing' ? tts.pause : tts.play}
          disabled={playDisabled}
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

        <div className="chrome__controls">
          <button
            className="chrome__icon"
            popoverTarget="settings-panel"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
