import { useEffect, useRef, useState } from 'react'
import { CaseSensitive, ChevronDown, ChevronUp, X } from 'lucide-react'
import type { FoliateView, SearchMatch } from 'foliate-js/view.js'
import './Search.css'

const DEBOUNCE_MS = 300

interface SearchProps {
  view: FoliateView
  onClose: () => void
}

export function Search({ view, onClose }: SearchProps) {
  const [query, setQuery] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [current, setCurrent] = useState(-1)
  // Guards against a slower, superseded search's results landing after a
  // newer one already finished -- same generation-counter pattern driver.ts
  // uses against speechSynthesis's own out-of-order callbacks.
  const gen = useRef(0)

  useEffect(() => {
    const myGen = ++gen.current
    const trimmed = query.trim()
    setMatches([])
    setCurrent(-1)
    if (!trimmed) {
      view.clearSearch()
      return
    }
    const timer = setTimeout(async () => {
      const found: SearchMatch[] = []
      for await (const result of view.search({ query: trimmed, matchCase })) {
        if (gen.current !== myGen) return
        if (typeof result === 'object' && 'subitems' in result) found.push(...result.subitems)
      }
      if (gen.current !== myGen) return
      setMatches(found)
      setCurrent(found.length ? 0 : -1)
      if (found.length) void view.goTo(found[0].cfi)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [view, query, matchCase])

  // Un-draws the match overlays when the search bar closes or the book changes.
  useEffect(() => () => view.clearSearch(), [view])

  function go(delta: number) {
    if (!matches.length) return
    const next = (current + delta + matches.length) % matches.length
    setCurrent(next)
    void view.goTo(matches[next].cfi)
  }

  function handleClose() {
    view.clearSearch()
    onClose()
  }

  return (
    <div className="search">
      <input
        className="search__input"
        type="text"
        placeholder="Search in book"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') go(e.shiftKey ? -1 : 1)
          else if (e.key === 'Escape') handleClose()
        }}
        autoFocus
      />
      <button
        className={`search__icon${matchCase ? ' search__icon--active' : ''}`}
        onClick={() => setMatchCase(m => !m)}
        aria-label="Match case"
        aria-pressed={matchCase}
      >
        <CaseSensitive size={16} />
      </button>
      <span className="search__count">
        {matches.length > 0 ? `${current + 1} of ${matches.length}` : query.trim() ? '0 results' : ''}
      </span>
      <button className="search__icon" onClick={() => go(-1)} aria-label="Previous match" disabled={!matches.length}>
        <ChevronUp size={16} />
      </button>
      <button className="search__icon" onClick={() => go(1)} aria-label="Next match" disabled={!matches.length}>
        <ChevronDown size={16} />
      </button>
      <button className="search__icon" onClick={handleClose} aria-label="Close search">
        <X size={16} />
      </button>
    </div>
  )
}
