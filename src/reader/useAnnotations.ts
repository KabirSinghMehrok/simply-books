import { useEffect, useRef, useState } from 'react'
import * as CFI from 'foliate-js/epubcfi.js'
import type { FoliateView } from 'foliate-js/view.js'
import {
  type AnnotationRecord,
  deleteAnnotation as dbDeleteAnnotation,
  listAnnotations,
  putAnnotation,
} from '../library/db'
import { findOverlapping, lastWords, planMerge, firstWords } from './annotations'
import { frameOffset } from './interactions'

const CONTEXT_WORDS = 2
// Bounds how many text nodes to hop across (skipping inline markup like
// <em>/footnote markers) before giving up on finding CONTEXT_WORDS -- cheap
// either way, just a sanity cap against a pathological document.
const CONTEXT_NODE_HOPS = 6

/**
 * A word or two immediately before/after a highlight, for the highlights
 * panel. Walks the section doc's own text nodes in document order via
 * TreeWalker -- same primitive foliate-js's own text-walker.js builds on --
 * so a highlight starting/ending right at an inline element boundary (an
 * <em>, a footnote marker) still finds real context on the other side of it
 * instead of stopping dead at the empty remainder of one text node.
 */
function surroundingWords(doc: Document, range: Range): { before: string; after: string } {
  return {
    before: lastWords(collectContext(doc, range.startContainer, range.startOffset, -1), CONTEXT_WORDS),
    after: firstWords(collectContext(doc, range.endContainer, range.endOffset, 1), CONTEXT_WORDS),
  }
}

function collectContext(doc: Document, container: Node, offset: number, dir: -1 | 1): string {
  // A Range boundary is occasionally an Element (offset = a child index)
  // rather than a Text node -- only possible at an edge a selection rarely
  // produces. Not worth resolving; the panel just shows no context there.
  if (container.nodeType !== Node.TEXT_NODE) return ''
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  walker.currentNode = container
  const text = container.textContent ?? ''
  const pieces = [dir < 0 ? text.slice(0, offset) : text.slice(offset)]
  for (let hop = 0; hop < CONTEXT_NODE_HOPS; hop++) {
    const wordCount = pieces.join(' ').trim().split(/\s+/).filter(Boolean).length
    if (wordCount >= CONTEXT_WORDS) break
    const next = dir < 0 ? walker.previousNode() : walker.nextNode()
    if (!next) break
    if (dir < 0) pieces.unshift(next.textContent ?? '')
    else pieces.push(next.textContent ?? '')
  }
  return pieces.join(' ')
}

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
    const doc = range.startContainer.ownerDocument

    let cfi = newCfi
    let finalRange = range
    let mergedNote = note
    if (overlapping.length) {
      const plan = planMerge(overlapping, newCfi, note)
      if (doc) {
        const start = view.resolveCFI(CFI.collapse(plan.startBoundaryCfi)).anchor(doc)
        const end = view.resolveCFI(CFI.collapse(plan.endBoundaryCfi, true)).anchor(doc)
        const merged = doc.createRange()
        merged.setStart(start.startContainer, start.startOffset)
        merged.setEnd(end.endContainer, end.endOffset)
        cfi = view.getCFI(index, merged)
        finalRange = merged
      }
      mergedNote = plan.note
      for (const old of overlapping) {
        void view.deleteAnnotation({ value: old.cfi })
        void dbDeleteAnnotation(old.id)
      }
    }

    const context = doc ? surroundingWords(doc, finalRange) : { before: '', after: '' }
    const now = Date.now()
    const record: AnnotationRecord = {
      id: crypto.randomUUID(),
      bookId,
      cfi,
      text: finalRange.toString(),
      contextBefore: context.before,
      contextAfter: context.after,
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
