import * as CFI from 'foliate-js/epubcfi.js'

// ---- pure CFI overlap/merge math ---------------------------------------
//
// Trap: `buildRange` (two CFIs -> one range CFI) is not exported by
// epubcfi.js. Merging is done by resolving both ends to real DOM points
// (planMerge only decides *which* CFIs are those endpoints) and re-deriving
// a CFI from the merged Range -- see useAnnotations.ts's addOrMergeHighlight,
// which needs a live `view` and DOM and is therefore not part of this pure,
// Node-testable module (same split as library/meta.ts's flatten/authors).

export interface AnnotationLike {
  id: string
  cfi: string
  color: string
  note: string | null
}

function rangesOverlap(a: string, b: string): boolean {
  return (
    CFI.compare(CFI.collapse(a), CFI.collapse(b, true)) <= 0 &&
    CFI.compare(CFI.collapse(a, true), CFI.collapse(b)) >= 0
  )
}

export function findOverlapping<T extends AnnotationLike>(existing: T[], cfi: string): T[] {
  return existing.filter(a => rangesOverlap(a.cfi, cfi))
}

export interface MergePlan {
  /** Notes from every absorbed highlight plus the new one, in document order, joined; null if none. */
  note: string | null
  /** The CFI (existing or new) whose collapsed start point is the merged range's start. */
  startBoundaryCfi: string
  /** The CFI (existing or new) whose collapsed end point is the merged range's end. */
  endBoundaryCfi: string
}

/**
 * Decides what a new highlight absorbs from the ones it overlaps -- new
 * color wins outright (trivially re-applied), notes concatenate (a written
 * note is not recoverable once dropped). Never touches the DOM: the caller
 * resolves `startBoundaryCfi`/`endBoundaryCfi` to real Ranges to build the
 * merged one, which only makes sense while the section is loaded anyway.
 */
export function planMerge(
  overlapping: AnnotationLike[],
  newCfi: string,
  newNote: string | null,
): MergePlan {
  const all: AnnotationLike[] = [...overlapping, { id: '', cfi: newCfi, color: '', note: newNote }]
  const byStart = (a: AnnotationLike, b: AnnotationLike) => CFI.compare(CFI.collapse(a.cfi), CFI.collapse(b.cfi))
  const byEnd = (a: AnnotationLike, b: AnnotationLike) =>
    CFI.compare(CFI.collapse(a.cfi, true), CFI.collapse(b.cfi, true))
  const earliest = all.reduce((a, b) => (byStart(a, b) <= 0 ? a : b))
  const latest = all.reduce((a, b) => (byEnd(a, b) >= 0 ? a : b))
  const note =
    all
      .slice()
      .sort(byStart)
      .map(a => a.note)
      .filter(Boolean)
      .join('\n\n') || null
  return { note, startBoundaryCfi: earliest.cfi, endBoundaryCfi: latest.cfi }
}

// ---- word-count helpers, shared by context capture and the notes panel ---

export function lastWords(text: string, n: number): string {
  return text.trim().split(/\s+/).filter(Boolean).slice(-n).join(' ')
}

export function firstWords(text: string, n: number): string {
  return text.trim().split(/\s+/).filter(Boolean).slice(0, n).join(' ')
}

/** Truncates to `n` words, appending an ellipsis if anything was cut. */
export function truncateWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length <= n ? text.trim() : words.slice(0, n).join(' ') + '…'
}

function demo() {
  const a = { id: 'a', cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:5)', color: '#a', note: null }
  const b = { id: 'b', cfi: 'epubcfi(/6/4!/4/2,/1:3,/1:10)', color: '#b', note: 'note-b' }
  const c = { id: 'c', cfi: 'epubcfi(/6/4!/4/2,/1:20,/1:30)', color: '#c', note: 'note-c' }
  const touching = { id: 'd', cfi: 'epubcfi(/6/4!/4/2,/1:10,/1:15)', color: '#d', note: null }

  console.assert(findOverlapping([a], c.cfi).length === 0, 'merge: non-overlapping stays separate')
  console.assert(findOverlapping([a, c], b.cfi).length === 1, 'merge: only the actually-overlapping one is found')

  console.assert(
    findOverlapping([b], touching.cfi).length === 1,
    'merge: touching ranges (b ends where d starts) count as overlapping',
  )

  const withNote = planMerge([a], b.cfi, 'note-new')
  console.assert(withNote.note === 'note-new', 'merge: new highlight carries its own note when the other has none')
  console.assert(
    withNote.startBoundaryCfi === a.cfi && withNote.endBoundaryCfi === b.cfi,
    'merge: boundary is the earliest start / latest end across both',
  )

  const bothNotes = planMerge([b], 'epubcfi(/6/4!/4/2,/1:8,/1:12)', 'note-new')
  console.assert(bothNotes.note === 'note-b\n\nnote-new', 'merge: both notes survive, in document order')

  // Three-way overlap: a new highlight spanning a..c absorbs both, in one merge.
  const wide = planMerge([a, b, c], 'epubcfi(/6/4!/4/2,/1:4,/1:22)', null)
  console.assert(
    wide.startBoundaryCfi === a.cfi && wide.endBoundaryCfi === c.cfi,
    'merge: a 3-way overlap collapses to one, spanning the widest existing edges',
  )
  console.assert(wide.note === 'note-b\n\nnote-c', 'merge: a null new note still keeps the absorbed ones')

  console.assert(lastWords('the quick brown fox', 2) === 'brown fox', 'lastWords: takes the trailing N words')
  console.assert(lastWords('  fox  ', 2) === 'fox', 'lastWords: fewer words than N returns what there is')
  console.assert(firstWords('the quick brown fox', 2) === 'the quick', 'firstWords: takes the leading N words')
  console.assert(truncateWords('one two three', 5) === 'one two three', 'truncateWords: no-op under the limit')
  console.assert(truncateWords('one two three', 2) === 'one two…', 'truncateWords: cuts and marks it with an ellipsis')

  console.log('annotations.ts: all checks passed')
}

// Vite always defines import.meta.env; plain `node --experimental-strip-types`
// does not -- so this runs the self-check under the latter and not the former.
if (import.meta.env === undefined) demo()
