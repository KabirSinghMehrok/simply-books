import { useEffect, useRef, useState } from 'react'
import type { SettingsRecord } from '../library/db'
import { useTtsDriver } from '../tts/driver'
import { Chrome } from './Chrome'
import { attachClickZones, attachKeys } from './interactions'
import { Rail } from './Rail'
import { SettingsPanel } from './SettingsPanel'
import { Toc } from './Toc'
import { useFoliate } from './useFoliate'
import './Reader.css'

const IDLE_MS = 2500

interface ReaderProps {
  bookId: string
  settings: SettingsRecord | null
  onUpdateSettings: (patch: Partial<SettingsRecord>) => void
  onClose: () => void
}

export function Reader({ bookId, settings, onUpdateSettings, onClose }: ReaderProps) {
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

  const { view, location, containerRef } = useFoliate(
    bookId,
    { onActivity: showChrome, onMiddleTap: () => setChromeVisible(v => !v) },
    settings,
  )
  const tts = useTtsDriver(view)

  // Starts the idle countdown once the book is ready, then wires input for
  // everything outside the book's iframe. Keys go on the window so paging
  // still works while a chrome control has focus; click zones go on the book
  // container only, never the window -- the chrome, rail and TOC are siblings
  // of it, so scoping the listener is what keeps their clicks from being read
  // as page turns. Only `view` needs to be a dependency: showChrome and
  // setChromeVisible only touch refs and stable setters.
  useEffect(() => {
    showChrome()
    if (!view) return
    const handlers = { onActivity: showChrome, onMiddleTap: () => setChromeVisible(v => !v) }
    const detachKeys = attachKeys(view, window, handlers)
    const container = containerRef.current
    const detachClicks = container ? attachClickZones(view, container, handlers) : undefined
    return () => {
      detachKeys()
      detachClicks?.()
    }
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
          {settings && (
            <SettingsPanel view={view} tts={tts} settings={settings} onUpdate={onUpdateSettings} />
          )}
        </>
      )}
    </div>
  )
}
