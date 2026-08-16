import { useEffect, useRef, useState } from 'react'
import type { FoliateView } from 'foliate-js/view.js'
import { getSettings, putSettings } from '../library/db'
import { ensureTts } from '../reader/useFoliate'
import { parseSSML, type Chunk } from './ssml'

export type Status = 'idle' | 'playing' | 'paused'

interface Internal {
  chunks: Chunk[]
  i: number
  gen: number // trap #4: cancel() fires onend synchronously on the outgoing
  // utterance, so a stale callback must not be allowed to advance the
  // queue a second time -- every callback checks its gen against this.
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | undefined

// Trap #7: getVoices() returns [] until 'voiceschanged' fires in Chrome.
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

/**
 * Drives Web Speech sentence-by-sentence over whatever `view.tts` is
 * currently loaded. Implements the state machine from the plan exactly:
 * play() has three cases (resume mid-block / first play of the session
 * starts from the visible page / otherwise resume the current block),
 * pause() only cancels the browser engine (`.pause()` is unreliable on
 * Android), and every callback into `speakFrom` is generation-guarded.
 */
export function useTtsDriver(view: FoliateView | null) {
  const [status, setStatus] = useState<Status>('idle')
  const [rate, setRateState] = useState(1)
  const [voice, setVoiceState] = useState<SpeechSynthesisVoice | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  const internal = useRef<Internal>({ chunks: [], i: 0, gen: 0 })
  const rateRef = useRef(1)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  // Held so Chrome can't GC an in-flight utterance mid-sentence.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // A new `view` means a new book: forget the old queue and stop talking.
  useEffect(() => {
    internal.current = { chunks: [], i: 0, gen: 0 }
    setStatus('idle')
    return () => {
      speechSynthesis.cancel()
    }
  }, [view])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const settings = await getSettings()
      if (cancelled) return
      rateRef.current = settings.ttsRate
      setRateState(settings.ttsRate)

      const list = sortLocalFirst(await loadVoices())
      if (cancelled) return
      setVoices(list)
      const preferred = list.find(v => v.voiceURI === settings.ttsVoiceURI) ?? list[0] ?? null
      voiceRef.current = preferred
      setVoiceState(preferred)
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [])

  function speakFrom(i: number) {
    if (!view?.tts) return
    const tts = view.tts
    const s = internal.current
    const chunk = s.chunks[i]
    if (!chunk) return
    s.i = i
    const myGen = ++s.gen
    speechSynthesis.cancel() // fires onend on the outgoing utterance -- gen guards against it

    const utter = new SpeechSynthesisUtterance(chunk.text)
    utteranceRef.current = utter
    utter.voice = voiceRef.current
    utter.rate = rateRef.current
    utter.onstart = () => {
      if (s.gen === myGen && chunk.mark) tts.setMark(chunk.mark)
    }
    utter.onend = () => {
      if (s.gen === myGen) void nextSentence()
    }
    utter.onerror = e => {
      if (s.gen === myGen && e.error !== 'interrupted' && e.error !== 'canceled') void nextSentence()
    }
    speechSynthesis.speak(utter)
    setStatus('playing')
  }

  function load(ssml: string | undefined, at: 'first' | 'last' = 'first') {
    if (ssml === undefined) {
      void advanceSection()
      return
    }
    const chunks = parseSSML(ssml)
    internal.current.chunks = chunks
    speakFrom(at === 'last' ? chunks.length - 1 : 0)
  }

  async function advanceSection() {
    if (!view) return
    await view.next()
    const tts = await ensureTts(view)
    load(tts.start())
  }

  async function play() {
    if (!view) return
    if (status === 'paused') {
      speakFrom(internal.current.i)
      return
    }
    const tts = await ensureTts(view)
    // First play of the session starts from the visible page, not the
    // top of the chapter -- otherwise opening at page 40 and pressing
    // play would read from page 1.
    if (internal.current.chunks.length === 0 && view.lastLocation) {
      load(tts.from(view.lastLocation.range))
    } else {
      load(tts.resume())
    }
  }

  function pause() {
    speechSynthesis.cancel() // .pause() is unreliable on Android
    setStatus('paused')
  }

  async function nextSentence() {
    if (!view) return
    const s = internal.current
    if (s.i + 1 < s.chunks.length) {
      speakFrom(s.i + 1)
      return
    }
    const tts = await ensureTts(view)
    load(tts.next())
  }

  async function prevSentence() {
    if (!view) return
    const s = internal.current
    if (s.i - 1 >= 0) {
      speakFrom(s.i - 1)
      return
    }
    const tts = await ensureTts(view)
    load(tts.prev(), 'last')
  }

  // The explicit escape hatch: restarts at the top of whatever page is
  // on screen right now, instead of wherever playback left off. Deliberate
  // and manual -- silently resyncing on every page turn would discard a
  // listening position just because the reader glanced at another page.
  async function readThisPage() {
    if (!view?.lastLocation) return
    const tts = await ensureTts(view)
    load(tts.from(view.lastLocation.range))
  }

  function setRate(next: number) {
    rateRef.current = next
    setRateState(next)
    void getSettings().then(s => putSettings({ ...s, ttsRate: next }))
  }

  function setVoice(next: SpeechSynthesisVoice) {
    voiceRef.current = next
    setVoiceState(next)
    void getSettings().then(s => putSettings({ ...s, ttsVoiceURI: next.voiceURI }))
  }

  return {
    status,
    play: () => void play(),
    pause,
    nextSentence: () => void nextSentence(),
    prevSentence: () => void prevSentence(),
    readThisPage: () => void readThisPage(),
    rate,
    setRate,
    voice,
    setVoice,
    voices,
  }
}
