/**
 * Type stub for 'foliate-js/view.js', wired in via tsconfig `paths`.
 *
 * foliate-js ships no types, and TS's `bundler`/`node16` moduleResolution
 * does not honor a `declare module 'foliate-js/view.js'` ambient block for
 * a package that resolves to a real file (it uses the real untyped file
 * instead of the ambient declaration -- `node10` classic resolution would
 * honor it, but `paths` is the modern equivalent and doesn't require
 * downgrading resolution mode). This file is never bundled: `paths` only
 * redirects TypeScript's type checker, not Vite's runtime resolution, so
 * the real foliate-js/view.js still ships at runtime.
 *
 * Authored from view.js/epub.js/tts.js source -- see plan traps table.
 */

/** A language map: a plain string, or { [lang]: string } for localized values. */
export type LangMap = string | Record<string, string>
export interface Contributor { name: LangMap; sortAs?: LangMap; role?: string[] }
/**
 * A contributor at any depth epub.js's `tidy()` (epub.js:136) may leave it:
 * the full object, or -- once tidy collapses an object whose only key is
 * `name` -- the bare LangMap. Always read these through meta.ts.
 */
export type Contributorish = LangMap | Contributor
export interface Metadata {
  identifier?: string
  title?: LangMap | null          // NOT a plain string — see trap #3
  subtitle?: string
  // `tidy()` collapses every single-element array to the bare element, so
  // each of these is only really an array when the OPF had 2+ entries.
  language?: string | string[]
  author?: Contributorish | Contributorish[]   // absent when the OPF has no dc:creator
  publisher?: Contributorish | Contributorish[]
  description?: string
  published?: string
}
export interface TocItem { label: string; href: string; subitems?: TocItem[] }
export interface Book {
  metadata: Metadata
  toc?: TocItem[]
  sections: unknown[]
  getCover(): Promise<Blob | null>
}
export function makeBook(file: File | Blob | string): Promise<Book>

export interface Location {
  fraction: number
  location: { current: number; next: number; total: number }
  tocItem?: TocItem
  cfi: string
  /** The currently visible range — the input to "read this page". */
  range: Range
}
export interface Tts {
  doc: Document
  start(): string | undefined
  resume(): string | undefined
  next(paused?: boolean): string | undefined
  prev(paused?: boolean): string | undefined
  from(range: Range): string | undefined
  setMark(name: string): void
}
export interface Renderer extends HTMLElement {
  scrollToAnchor(target: Range | Element | number, select?: boolean): void
  /** The loaded section(s) -- one entry in paginated mode, [] before load. */
  getContents(): { index: number; doc: Document }[]
  destroy(): void
}
/** What `view.resolveCFI`/`epub.js`'s resolver hands back for any CFI string. */
export interface ResolvedCFI {
  index: number
  /** Always returns a Range -- collapsed (zero-length) for a point CFI. */
  anchor(doc: Document): Range
}

export interface FoliateView extends HTMLElement {
  book: Book
  renderer: Renderer
  tts: Tts | null
  lastLocation: Location | null
  open(book: Book): Promise<void>
  close(): void
  init(opts: { lastLocation?: string; showTextStart?: boolean }): Promise<void>
  next(distance?: number): Promise<void>
  prev(distance?: number): Promise<void>
  /** Respects book direction: next() in RTL books, prev() otherwise. */
  goLeft(): Promise<void>
  /** Respects book direction: prev() in RTL books, next() otherwise. */
  goRight(): Promise<void>
  goTo(target: string | number): Promise<void>
  goToFraction(f: number): Promise<void>
  /**
   * NOTE: takes granularity ONLY. It hardcodes its own highlight callback
   * (`scrollToAnchor(range, true)`) and ignores further arguments, so it
   * cannot draw our underline and always leaves a DOM selection behind.
   * useFoliate's ensureTts builds a TTS directly instead -- do not call this.
   */
  initTTS(granularity: 'word' | 'sentence'): Promise<void>
  /** A CFI for `range` inside section `index` -- omit `range` for the section's own base CFI. */
  getCFI(index: number, range?: Range): string
  resolveCFI(cfi: string): ResolvedCFI
  /**
   * Draws (or, with `remove`, un-draws) an annotation keyed by `annotation.value`
   * (a CFI). Silently no-ops if that CFI's section isn't currently loaded --
   * safe to call for every persisted annotation on every `create-overlay`.
   * Extra properties on `annotation` (color, note, ...) ride along to the
   * `draw-annotation` event's `detail.annotation`.
   */
  addAnnotation(
    annotation: { value: string; [key: string]: unknown },
    remove?: boolean,
  ): Promise<{ index: number; label: string } | undefined>
  deleteAnnotation(annotation: { value: string }): Promise<{ index: number; label: string } | undefined>
}
