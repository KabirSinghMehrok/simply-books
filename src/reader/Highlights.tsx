import { X } from 'lucide-react'
import * as CFI from 'foliate-js/epubcfi.js'
import type { FoliateView } from 'foliate-js/view.js'
import type { AnnotationRecord } from '../library/db'
import { truncateWords } from './annotations'
import './Highlights.css'

const NOTE_WORD_LIMIT = 50

// A highlight boundary landing right next to punctuation ("...world." /
// "circulation. Whenever...") shouldn't get an inserted space -- there
// wasn't one in the source text either.
const CLOSING_PUNCT = /^[.,;:!?)\]}'"’”]/
const OPENING_PUNCT = /[([{'"‘“]$/

interface HighlightsProps {
  view: FoliateView
  annotations: AnnotationRecord[]
  onClose: () => void
}

export function Highlights({ view, annotations, onClose }: HighlightsProps) {
  const ordered = [...annotations].sort((a, b) => CFI.compare(a.cfi, b.cfi))

  function handleSelect(cfi: string) {
    void view.goTo(cfi)
    onClose()
  }

  return (
    <div className="highlights">
      <div className="highlights__header">
        <h2>Highlights & Notes</h2>
        <button className="highlights__close" onClick={onClose} aria-label="Close highlights">
          <X size={16} />
        </button>
      </div>
      {ordered.length > 0 ? (
        <ul className="highlights__list">
          {ordered.map(a => (
            <li key={a.id}>
              <button className="highlights__item" onClick={() => handleSelect(a.cfi)}>
                <span className="highlights__swatch" style={{ background: a.color }} />
                <span className="highlights__body">
                  <span className="highlights__excerpt">
                    {a.contextBefore && (
                      <span className="highlights__context">
                        …{a.contextBefore}
                        {OPENING_PUNCT.test(a.contextBefore) ? '' : ' '}
                      </span>
                    )}
                    {a.text}
                    {a.contextAfter && (
                      <span className="highlights__context">
                        {CLOSING_PUNCT.test(a.contextAfter) ? '' : ' '}
                        {a.contextAfter}…
                      </span>
                    )}
                  </span>
                  {a.note && <span className="highlights__note">{truncateWords(a.note, NOTE_WORD_LIMIT)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="highlights__empty">No highlights or notes yet.</p>
      )}
    </div>
  )
}
