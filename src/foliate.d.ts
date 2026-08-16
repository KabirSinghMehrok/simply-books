declare module 'foliate-js/view.js' {
  /** A language map: a plain string, or { [lang]: string } for localized values. */
  export type LangMap = string | Record<string, string>
  export interface Contributor { name: LangMap; sortAs?: LangMap; role?: string[] }
  export interface Metadata {
    identifier?: string
    title?: LangMap | null          // NOT a plain string — see trap #3
    subtitle?: string
    language?: string[]             // an array
    author?: Contributor[]          // absent when the OPF has no dc:creator
    publisher?: Contributor[]
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
    destroy(): void
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
    goTo(target: string | number): Promise<void>
    goToFraction(f: number): Promise<void>
    initTTS(granularity: 'word' | 'sentence', highlight?: (r: Range) => void): Promise<void>
  }
}
declare global {
  interface HTMLElementTagNameMap { 'foliate-view': import('foliate-js/view.js').FoliateView }
}
export {}
