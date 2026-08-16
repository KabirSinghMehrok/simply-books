/**
 * Type stub for 'foliate-js/tts.js', wired in via tsconfig `paths` -- same
 * arrangement, and same reasoning, as foliate-view.d.ts.
 *
 * We construct TTS directly rather than going through `view.initTTS()`,
 * because initTTS takes a *single* parameter:
 *
 *   async initTTS(granularity = 'word') {
 *       this.tts = new TTS(doc, textWalker, range =>
 *           this.renderer.scrollToAnchor(range, true), granularity)
 *   }
 *
 * It hardcodes its own highlight callback and silently discards any second
 * argument, so there is no way to get our accent underline drawn -- or to
 * avoid `select: true`, which leaves a live DOM selection on every spoken
 * sentence and thereby suppresses click-to-turn-page inside the book.
 * Constructing TTS ourselves is the only way to own that callback.
 */
import type { Tts } from './foliate-view'

/** Opaque -- TTS only ever hands it back to foliate's own segmenter. */
export type TextWalker = unknown

export declare class TTS implements Tts {
  constructor(
    doc: Document,
    textWalker: TextWalker,
    highlight: (range: Range) => void,
    granularity: 'word' | 'sentence',
  )
  doc: Document
  start(): string | undefined
  resume(): string | undefined
  next(paused?: boolean): string | undefined
  prev(paused?: boolean): string | undefined
  from(range: Range): string | undefined
  setMark(name: string): void
}
