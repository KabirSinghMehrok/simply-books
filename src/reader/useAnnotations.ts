import { useEffect, useRef, useState } from 'react'
import * as CFI from 'foliate-js/epubcfi.js'
import type { FoliateView } from 'foliate-js/view.js'
import {
  type AnnotationRecord,
  deleteAnnotation as dbDeleteAnnotation,
  listAnnotations,
  putAnnotation,
} from '../library/db'
import { findOverlapping, planMerge } from './annotations'
import { frameOffset } from './interactions'

export interface NoteMarker {
  id: string
  color: string
  note: string
  /** Viewport-relative position, anchored to the end of the highlight's last client rect. */
  left: number
  top: number
}

/**
 * Note indicators are recomputed from scratch on every call rather than
 * cached from the highlight's `draw-annotation` event: a section's iframe is
 * viewport-sized but its multi-column content pans *inside* it, so a rect
 * captured once at draw time (section load) goes stale the moment the
 * reader turns to a different page of the same, still-loaded section. Call
 * this on every `location` change (i.e. every relocate), not just on load.
 */
export function computeMarkers(view: FoliateView, annotations: AnnotationRecord[]): NoteMarker[] {
  const markers: NoteMarker[] = []
  for (const { index, doc } of view.renderer.getContents()) {
    for (const a of annotations) {
      if (!a.note) continue
      let resolved
      try {
        resolved = view.resolveCFI(a.cfi)
      } catch {
        continue // stored CFI doesn't resolve against this book -- skip rather than crash the page
      }
      if (resolved.index !== index) continue
      const rects = resolved.anchor(doc).getClientRects()
      const last = rects[rects.length - 1]
      if (!last) continue
      const { dx, dy } = frameOffset(doc)
      markers.push({ id: a.id, color: a.color, note: a.note, left: last.right + dx, top: last.top + dy })
    }
  }
  return markers
}

/** Loads/persists one book's highlights, and applies annotations.ts's merge plan against the live view. */
export function useAnnotations(bookId: string) {
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([])
  const ref = useRef<AnnotationRecord[]>(annotations)
  useEffect(() => {
    ref.current = annotations
  }, [annotations])

  useEffect(() => {
    let cancelled = false
    setAnnotations([])
    void listAnnotations(bookId).then(list => {
      if (!cancelled) setAnnotations(list)
    })
    return () => {
      cancelled = true
    }
  }, [bookId])

  async function addOrMergeHighlight(
    view: FoliateView,
    range: Range,
    index: number,
    color: string,
    note: string | null,
  ): Promise<void> {
    const newCfi = view.getCFI(index, range)
    const overlapping = findOverlapping(ref.current, newCfi)

    let cfi = newCfi
    let text = range.toString()
    let mergedNote = note
    if (overlapping.length) {
      const plan = planMerge(overlapping, newCfi, note)
      const doc = range.startContainer.ownerDocument
      if (doc) {
        const start = view.resolveCFI(CFI.collapse(plan.startBoundaryCfi)).anchor(doc)
        const end = view.resolveCFI(CFI.collapse(plan.endBoundaryCfi, true)).anchor(doc)
        const merged = doc.createRange()
        merged.setStart(start.startContainer, start.startOffset)
        merged.setEnd(end.endContainer, end.endOffset)
        cfi = view.getCFI(index, merged)
        text = merged.toString()
      }
      mergedNote = plan.note
      for (const old of overlapping) {
        void view.deleteAnnotation({ value: old.cfi })
        void dbDeleteAnnotation(old.id)
      }
    }

    const now = Date.now()
    const record: AnnotationRecord = {
      id: crypto.randomUUID(),
      bookId,
      cfi,
      text,
      color,
      note: mergedNote,
      createdAt: now,
      updatedAt: now,
    }
    await putAnnotation(record)
    const overlappingIds = new Set(overlapping.map(a => a.id))
    setAnnotations(prev => [...prev.filter(a => !overlappingIds.has(a.id)), record])
    void view.addAnnotation({ value: record.cfi, color: record.color })
  }

  async function deleteHighlight(view: FoliateView, record: AnnotationRecord): Promise<void> {
    void view.deleteAnnotation({ value: record.cfi })
    await dbDeleteAnnotation(record.id)
    setAnnotations(prev => prev.filter(a => a.id !== record.id))
  }

  async function updateNote(record: AnnotationRecord, note: string | null): Promise<void> {
    const next = { ...record, note, updatedAt: Date.now() }
    await putAnnotation(next)
    setAnnotations(prev => prev.map(a => (a.id === record.id ? next : a)))
  }

  return { annotations, addOrMergeHighlight, deleteHighlight, updateNote }
}
