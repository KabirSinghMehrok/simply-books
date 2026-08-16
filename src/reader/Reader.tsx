import { useEffect, useRef, useState } from 'react'
import { useTtsDriver } from '../tts/driver'
import { Chrome } from './Chrome'
import { attachInteractions } from './interactions'
import { Rail } from './Rail'
import { Toc } from './Toc'
import { useFoliate } from './useFoliate'
import './Reader.css'

const IDLE_MS = 2500

export function Reader({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const [chromeVisible, setChromeVisible] = useState(true)
  const [tocOpen, setTocOpen] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Read once: this doesn't need to react to the setting changing mid-session.
  const reducedMotion = useRef(
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  ).current

  function showChrome() {
    setChromeVisible(true)
    if (reducedMotion) return
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setChromeVisible(false), IDLE_MS)
  }

  const { view, location, containerRef } = useFoliate(bookId, {
    onActivity: showChrome,
    onMiddleTap: () => setChromeVisible(v => !v),
  })
  const tts = useTtsDriver(view)

  // Starts the idle countdown once the book is ready, and wires the same
  // click/key/activity handling to the outer window -- covers focus being
  // on a chrome control rather than inside the book's iframe. Only `view`
  // needs to be a dependency: showChrome/setChromeVisible only touch refs
  // and stable setters, so re-running this on their account isn't needed.
  useEffect(() => {
    showChrome()
    if (!view) return
    return attachInteractions(view, window, {
      onActivity: showChrome,
      onMiddleTap: () => setChromeVisible(v => !v),
    })
  }, [view])

  return (
    <div className="reader">
      <div className="reader__book" ref={containerRef} />
      {!view && <div className="reader__loading">Opening…</div>}
      {view && (
        <>
          <Rail view={view} location={location} />
          <Chrome
            view={view}
            tts={tts}
            visible={chromeVisible}
            onToggleToc={() => setTocOpen(o => !o)}
            onClose={onClose}
          />
          {tocOpen && <Toc view={view} onClose={() => setTocOpen(false)} />}
        </>
      )}
    </div>
  )
}
