import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnnotationRecord, SettingsRecord } from '../library/db'
import { useTtsDriver } from '../tts/driver'
import { Chrome } from './Chrome'
import { Highlights } from './Highlights'
import { attachClickZones, attachKeys, type SelectionInfo } from './interactions'
import { NoteEditor } from './NoteEditor'
import { Rail } from './Rail'
import { Search } from './Search'
import { SelectionToolbar } from './SelectionToolbar'
import { SettingsPanel } from './SettingsPanel'
import { Toc } from './Toc'
import { computeMarkers, useAnnotations } from './useAnnotations'
import { useFoliate } from './useFoliate'
import './Reader.css'

const IDLE_MS = 2500
// Below this width, one thumb can't reach every corner of a single bar --
// Chrome/Rail split into the two-bar, three-corner mobile layout instead.
const MOBILE_BREAKPOINT = 700

function useIsMobile(breakpoint: number): boolean {
  const query = `(max-width: ${breakpoint}px)`
  const [isMobile, setIsMobile] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mql = matchMedia(query)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return isMobile
}

/** What the note editor is open for: a brand-new highlight, or an existing one. */
type NoteTarget =
  | { kind: 'new'; range: Range; index: number; color: string }
  | { kind: 'edit'; record: AnnotationRecord }

interface ReaderProps {
  bookId: string
  settings: SettingsRecord | null
  onUpdateSettings: (patch: Partial<SettingsRecord>) => void
  onClose: () => void
}

export function Reader({ bookId, settings, onUpdateSettings, onClose }: ReaderProps) {
  const [chromeVisible, setChromeVisible] = useState(true)
  const [tocOpen, setTocOpen] = useState(false)
  const [highlightsOpen, setHighlightsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selection, setSelection] = useState<(SelectionInfo & { index: number }) | null>(null)
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const isMobile = useIsMobile(MOBILE_BREAKPOINT)
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

  const { annotations, addOrMergeHighlight, deleteHighlight, updateNote } = useAnnotations(bookId)
  const { view, location, containerRef } = useFoliate(
    bookId,
    {
      onActivity: showChrome,
      onMiddleTap: () => setChromeVisible(v => !v),
      onSelection: (info, index) => setSelection(info && { ...info, index }),
    },
    settings,
    annotations,
  )
  const tts = useTtsDriver(view)
  // Rects need re-measuring on every page turn, not just when the annotation
  // list changes -- a section's multi-column content pans inside a
  // viewport-sized iframe, so a rect measured at one page is wrong on the next.
  const markers = useMemo(() => (view ? computeMarkers(view, annotations) : []), [view, annotations, location])

  function handlePickColor(color: string) {
    if (!view || !selection) return
    void addOrMergeHighlight(view, selection.range, selection.index, color, null)
    onUpdateSettings({ lastHighlightColor: color })
    setSelection(null)
  }

  function handleAddNote() {
    if (!selection) return
    setNoteTarget({
      kind: 'new',
      range: selection.range,
      index: selection.index,
      color: settings?.lastHighlightColor ?? '#ffe066',
    })
    setSelection(null)
  }

  function handleSaveNote(text: string) {
    if (!view || !noteTarget) return
    if (noteTarget.kind === 'edit') void updateNote(noteTarget.record, text || null)
    else void addOrMergeHighlight(view, noteTarget.range, noteTarget.index, noteTarget.color, text || null)
    setNoteTarget(null)
  }

  function handleDeleteHighlight() {
    if (!view || noteTarget?.kind !== 'edit') return
    void deleteHighlight(view, noteTarget.record)
    setNoteTarget(null)
  }

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
          <Rail view={view} location={location} isMobile={isMobile} />
          <Chrome
            view={view}
            tts={tts}
            visible={chromeVisible}
            isMobile={isMobile}
            onToggleToc={() => setTocOpen(o => !o)}
            onToggleHighlights={() => setHighlightsOpen(o => !o)}
            onToggleSearch={() => setSearchOpen(o => !o)}
            onClose={onClose}
          />
          {tocOpen && <Toc view={view} onClose={() => setTocOpen(false)} />}
          {highlightsOpen && (
            <Highlights view={view} annotations={annotations} onClose={() => setHighlightsOpen(false)} />
          )}
          {searchOpen && <Search view={view} onClose={() => setSearchOpen(false)} />}
          {settings && (
            <SettingsPanel view={view} tts={tts} settings={settings} onUpdate={onUpdateSettings} />
          )}
          {selection && (
            <SelectionToolbar rect={selection.rect} onPick={handlePickColor} onNote={handleAddNote} />
          )}
          {markers.map(marker => (
            <button
              key={marker.id}
              className="reader__note-marker"
              style={{ left: marker.left, top: marker.top, background: marker.color }}
              aria-label="Open note"
              onClick={() => {
                const record = annotations.find(a => a.id === marker.id)
                if (record) setNoteTarget({ kind: 'edit', record })
              }}
            />
          ))}
        </>
      )}
      {noteTarget && (
        <NoteEditor
          color={noteTarget.kind === 'edit' ? noteTarget.record.color : noteTarget.color}
          initialText={noteTarget.kind === 'edit' ? (noteTarget.record.note ?? '') : ''}
          onSave={handleSaveNote}
          onDelete={noteTarget.kind === 'edit' ? handleDeleteHighlight : undefined}
          onCancel={() => setNoteTarget(null)}
        />
      )}
    </div>
  )
}
