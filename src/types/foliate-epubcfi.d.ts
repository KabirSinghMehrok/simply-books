/**
 * Type stub for 'foliate-js/epubcfi.js', wired in via tsconfig `paths` --
 * same arrangement, and same reasoning, as foliate-view.d.ts.
 *
 * Only the exports annotations.ts actually uses. Notably absent:
 * `buildRange` is not exported by the module at all (merging two CFIs into
 * one range CFI has to go through real DOM Ranges instead -- see
 * useAnnotations.ts).
 */
export const isCFI: RegExp
export function compare(a: string, b: string): number
export function collapse(cfi: string, toEnd?: boolean): string
export function parse(cfi: string): unknown
export function toRange(doc: Document, parts: unknown): Range
