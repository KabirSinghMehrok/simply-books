/**
 * The state machine in driver.ts drives one of these, never SpeechSynthesis
 * or an <audio> element directly. Web Speech resolves speak() on the
 * utterance's `onend`; Piper (piper-engine.ts) resolves it on the `<audio>`
 * element's `ended`. Every trap that used to live in driver.ts alone --
 * the generation counter, the "cancel() completes the outgoing utterance
 * synchronously" behavior -- stays true here: cancel() is expected to make
 * an in-flight speak() promise resolve immediately, exactly like
 * `speechSynthesis.cancel()` firing `onend` on the utterance being replaced.
 */
export interface EngineVoice {
  voiceId: string
  name: string
  localService: boolean
}

export interface SpeakOpts {
  rate: number
  voiceId: string | null
  /** The text of the sentence after this one, if any -- lets an async engine start synthesizing ahead of playback so there's no gap at the sentence boundary. */
  next?: string
  /** Fires once this sentence is actually audible (not merely queued) -- this is when the driver moves the spoken-range mark, so the highlight tracks the voice instead of leading it. */
  onStart?: () => void
}

export interface SpeechEngine {
  /** Resolves once this utterance is done, however it ended -- naturally, via cancel(), or on error. The caller's generation counter decides whether that means "advance". */
  speak(text: string, opts: SpeakOpts): Promise<void>
  cancel(): void
  voices(): Promise<EngineVoice[]>
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | undefined

// getVoices() returns [] until 'voiceschanged' fires in Chrome.
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  voicesPromise ??= new Promise(resolve => {
    const existing = speechSynthesis.getVoices()
    if (existing.length > 0) {
      resolve(existing)
      return
    }
    speechSynthesis.addEventListener('voiceschanged', () => resolve(speechSynthesis.getVoices()), {
      once: true,
    })
  })
  return voicesPromise
}

// Chrome's "Google ..." voices are network-backed; local ones speak with
// no round trip and no dependency on being online. Surface those first.
function sortLocalFirst(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => Number(b.localService) - Number(a.localService))
}

export class WebSpeechEngine implements SpeechEngine {
  private raw: SpeechSynthesisVoice[] = []
  // Held so Chrome can't GC an in-flight utterance mid-sentence -- not
  // `private`: a write-only private field is itself flagged as unused by tsc.
  utterance: SpeechSynthesisUtterance | null = null

  async voices(): Promise<EngineVoice[]> {
    this.raw = sortLocalFirst(await loadVoices())
    return this.raw.map(v => ({ voiceId: v.voiceURI, name: v.name, localService: v.localService }))
  }

  speak(text: string, opts: SpeakOpts): Promise<void> {
    return new Promise(resolve => {
      const utter = new SpeechSynthesisUtterance(text)
      this.utterance = utter
      utter.voice = this.raw.find(v => v.voiceURI === opts.voiceId) ?? null
      utter.rate = opts.rate
      utter.onstart = () => opts.onStart?.()
      utter.onend = () => resolve()
      utter.onerror = () => resolve()
      speechSynthesis.speak(utter)
    })
  }

  cancel(): void {
    // Fires the outgoing utterance's onend synchronously -- driver.ts's
    // generation counter is what stops that from double-advancing the queue.
    speechSynthesis.cancel()
  }
}
