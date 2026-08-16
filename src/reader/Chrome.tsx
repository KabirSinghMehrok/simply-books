import { ChevronDown, List, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from 'lucide-react'
import type { FoliateView } from 'foliate-js/view.js'
import type { useTtsDriver } from '../tts/driver'
import { flatten } from '../library/meta'
import './Chrome.css'

const RATES = [0.75, 1, 1.25, 1.5, 2]

interface ChromeProps {
  view: FoliateView
  tts: ReturnType<typeof useTtsDriver>
  visible: boolean
  onToggleToc: () => void
  onClose: () => void
}

export function Chrome({ view, tts, visible, onToggleToc, onClose }: ChromeProps) {
  const title = flatten(view.book.metadata.title) || 'Untitled'

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
          <div className="chrome__select">
            <select
              value={tts.rate}
              onChange={e => tts.setRate(Number(e.target.value))}
              aria-label="Reading speed"
            >
              {RATES.map(r => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>

          {tts.voices.length > 0 && (
            <div className="chrome__select">
              <select
                value={tts.voice?.voiceURI ?? ''}
                onChange={e => {
                  const next = tts.voices.find(v => v.voiceURI === e.target.value)
                  if (next) tts.setVoice(next)
                }}
                aria-label="Voice"
              >
                {tts.voices.map(v => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                    {v.localService ? '' : ' (online)'}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
