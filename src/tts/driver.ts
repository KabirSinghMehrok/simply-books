import { useEffect, useRef, useState } from 'react'
import type { FoliateView, Tts } from 'foliate-js/view.js'
import { getSettings, putSettings, type TtsEngine } from '../library/db'
import { ensureTts } from '../reader/useFoliate'
import { WebSpeechEngine, type EngineVoice, type SpeechEngine } from './engine'
import { PiperEngine, type DownloadState } from './piper-engine'
import { parseSSML, type Chunk } from './ssml'

export type Status = 'idle' | 'playing' | 'paused'

interface Internal {
  chunks: Chunk[]
  i: number
  gen: number // trap #4: cancel() completes the outgoing utterance synchronously
  // (both engines do this -- see engine.ts/piper-engine.ts), so a stale
  // callback must not be allowed to advance the queue a second time --
  // every callback checks its gen against this.
  /**
   * The TTS instance these chunks came from. Mark names are per-block
   * integers valid only for the instance that emitted them, and a new
   * section (TOC jump, rail seek) makes ensureTts build a fresh TTS whose
   * ranges are not populated until it is asked for a block. Handing such an
   * instance a stale mark throws inside tts.js (`#ranges.get` of undefined),
   * so the queue is dropped when its owner is no longer the current TTS.
   */
  tts: Tts | null
  /** The engine instance that actually started the current utterance -- not
   * necessarily engineFor(engineRef.current): activeEngine() can fall back
   * to Web Speech while the settings still name Piper. stop() cancels this
   * instance, never "whichever engine the dropdown currently names". */
  engine: SpeechEngine | null
}

const EMPTY: Internal = { chunks: [], i: 0, gen: 0, tts: null, engine: null }

// One instance per engine for the app's whole lifetime, not per hook call:
// Web Speech is a global browser singleton regardless, and Piper's worker +
// downloaded model session are expensive enough that they must survive
// across books and re-renders rather than being torn down and rebuilt.
const webSpeechEngine = new WebSpeechEngine()
let piperEngine: PiperEngine | null = null
function getPiperEngine(): PiperEngine {
  piperEngine ??= new PiperEngine()
  return piperEngine
}
function engineFor(id: TtsEngine): SpeechEngine {
  return id === 'natural' ? getPiperEngine() : webSpeechEngine
}

/**
 * Drives sentence-by-sentence playback over whatever `view.tts` is currently
 * loaded, against either speech engine. Implements the state machine from
 * the plan exactly: play() has three cases (resume mid-block / first play of
 * the session starts from the visible page / otherwise resume the current
 * block), pause() only cancels the engine (`.pause()` on SpeechSynthesis is
 * unreliable on Android, and Piper has no pause semantics of its own either),
 * and every callback into `speakFrom` is generation-guarded.
 */
export function useTtsDriver(view: FoliateView | null) {
  const [status, setStatus] = useState<Status>('idle')
  const [rate, setRateState] = useState(1)
  const [engine, setEngineState] = useState<TtsEngine>('system')
  const [voice, setVoiceState] = useState<EngineVoice | null>(null)
  const [voices, setVoices] = useState<EngineVoice[]>([])
  const [piperDownload, setPiperDownload] = useState<DownloadState>({ status: 'not-downloaded' })

  const internal = useRef<Internal>({ ...EMPTY })
  const rateRef = useRef(1)
  const voiceRef = useRef<EngineVoice | null>(null)
  const engineRef = useRef<TtsEngine>('system')

  // The single guard every stop-talking path routes through: cancels the
  // engine instance that actually started the current utterance, not
  // whichever engine the settings currently name (activeEngine() below can
  // make those two differ routinely once the natural-voice fallback is in
  // play). Bumping gen first, same as before, so the cancelled call's own
  // completion callback can't double-advance the queue.
  function stop() {
    internal.current.gen++
    internal.current.engine?.cancel()
  }

  // A new `view` means a new book: forget the old queue and stop talking.
  useEffect(() => {
    internal.current = { ...EMPTY }
    setStatus('idle')
    return () => {
      stop()
    }
  }, [view])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const settings = await getSettings()
      if (cancelled) return
      rateRef.current = settings.ttsRate
      setRateState(settings.ttsRate)
      engineRef.current = settings.ttsEngine
      setEngineState(settings.ttsEngine)

      const list = await engineFor(settings.ttsEngine).voices()
      if (cancelled) return
      setVoices(list)
      const preferred = list.find(v => v.voiceId === settings.ttsVoiceURI) ?? list[0] ?? null
      voiceRef.current = preferred
      setVoiceState(preferred)
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [])

  // Reloads the voice list whenever the engine changes -- Piper always
  // resolves to its one bundled voice, System to whatever the OS offers.
  useEffect(() => {
    let cancelled = false
    async function loadVoices() {
      const list = await engineFor(engine).voices()
      if (cancelled) return
      setVoices(list)
      const settings = await getSettings()
      if (cancelled) return
      const preferred = list.find(v => v.voiceId === settings.ttsVoiceURI) ?? list[0] ?? null
      voiceRef.current = preferred
      setVoiceState(preferred)
    }
    void loadVoices()
    return () => {
      cancelled = true
    }
  }, [engine])

  // Piper's download progress is a subscription on the engine itself, not
  // this hook's state -- the worker reports it whenever it happens, and
  // multiple mounts (e.g. the settings panel) should see the same progress.
  useEffect(() => {
    if (engine !== 'natural') return
    return getPiperEngine().onDownloadState(setPiperDownload)
  }, [engine])

  // Media Session action handlers. `status` must be in the deps: the
  // handlers close over `play()`, which reads `status` directly (its
  // "resume from pause" branch) -- a `[view]`-only effect would pin the
  // first render's closure and read `status === 'idle'` forever. Cheap to
  // re-register on every status change.
  useEffect(() => {
    if (!view || !('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => play())
    navigator.mediaSession.setActionHandler('pause', () => pause())
    navigator.mediaSession.setActionHandler('previoustrack', () => prevSentence())
    navigator.mediaSession.setActionHandler('nexttrack', () => nextSentence())
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
    }
  }, [view, status])

  // Keeps the lock-screen/notification transport state in sync so its
  // play/pause icon doesn't disagree with the on-screen button.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none'
  }, [status])

  // The engine to actually speak the next sentence with. Natural falls back
  // to the system voice until its download lands -- play is never refused --
  // and auto-starts that download the first time it's needed, so pressing
  // play on an undownloaded natural voice is the only gesture required.
  // Re-evaluated per sentence, so playback upgrades to Piper mid-book, right
  // after the download finishes, with no further user action.
  function activeEngine(): SpeechEngine {
    if (engineRef.current !== 'natural') return webSpeechEngine
    const piper = getPiperEngine()
    if (piper.getDownloadState().status === 'ready') return piper
    piper.download() // idempotent -- no-ops while already downloading or ready
    return webSpeechEngine // speak now with the system voice; switch over at the next sentence
  }

  function speakFrom(i: number) {
    const s = internal.current
    const tts = s.tts
    if (!view || !tts) return
    // The reader navigated to another section while this queue was in flight,
    // so its chunks (and their marks) belong to a document that is no longer
    // loaded. Drop it rather than speak text that is no longer on screen.
    if (view.tts !== tts) {
      internal.current = { ...EMPTY }
      setStatus('idle')
      return
    }
    const chunk = s.chunks[i]
    if (!chunk) return
    s.i = i
    stop() // completes the outgoing utterance immediately -- gen guards against it double-advancing
    const myGen = s.gen
    const active = activeEngine()
    s.engine = active

    void active
      .speak(chunk.text, {
        rate: rateRef.current,
        voiceId: voiceRef.current?.voiceId ?? null,
        next: s.chunks[i + 1]?.text,
        onStart: () => {
          if (s.gen === myGen && chunk.mark) tts.setMark(chunk.mark)
        },
      })
      .then(() => {
        if (s.gen === myGen) void nextSentence()
      })
    setStatus('playing')
  }

  /** `tts` is the instance that produced `ssml` -- see Internal.tts. */
  function load(tts: Tts, ssml: string | undefined, at: 'first' | 'last' = 'first') {
    if (ssml === undefined) {
      void advanceSection()
      return
    }
    const chunks = parseSSML(ssml)
    internal.current.chunks = chunks
    internal.current.tts = tts
    speakFrom(at === 'last' ? chunks.length - 1 : 0)
  }

  async function advanceSection() {
    if (!view) return
    await view.next()
    const tts = await ensureTts(view)
    load(tts, tts.start())
  }

  async function play() {
    if (!view) return
    const s = internal.current
    // A queue belonging to a section we have since navigated away from can't
    // be resumed. Drop it here rather than let speakFrom bail, which would
    // make the first press of play silently do nothing.
    if (s.tts && s.tts !== view.tts) internal.current = { ...EMPTY }
    if (status === 'paused' && internal.current.chunks.length > 0) {
      speakFrom(internal.current.i)
      return
    }
    const tts = await ensureTts(view)
    // First play of the session starts from the visible page, not the
    // top of the chapter -- otherwise opening at page 40 and pressing
    // play would read from page 1.
    if (internal.current.chunks.length === 0 && view.lastLocation) {
      load(tts, tts.from(view.lastLocation.range))
    } else {
      load(tts, tts.resume())
    }
  }

  function pause() {
    // Trap #4 again, on the one path the plan's pseudocode left unguarded:
    // cancel() completes the in-flight utterance synchronously, and that
    // handler only checks its own generation. Without invalidating it first,
    // pausing ran nextSentence() -- so the voice carried on to the next
    // sentence, scrollToAnchor dragged the page after it, and speakFrom set
    // the status straight back to 'playing'. Pause never actually paused.
    stop()
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
    load(tts, tts.next())
  }

  async function prevSentence() {
    if (!view) return
    const s = internal.current
    if (s.i - 1 >= 0) {
      speakFrom(s.i - 1)
      return
    }
    const tts = await ensureTts(view)
    load(tts, tts.prev(), 'last')
  }

  // The explicit escape hatch: restarts at the top of whatever page is
  // on screen right now, instead of wherever playback left off. Deliberate
  // and manual -- silently resyncing on every page turn would discard a
  // listening position just because the reader glanced at another page.
  async function readThisPage() {
    if (!view?.lastLocation) return
    const tts = await ensureTts(view)
    load(tts, tts.from(view.lastLocation.range))
  }

  function setRate(next: number) {
    rateRef.current = next
    setRateState(next)
    void getSettings().then(s => putSettings({ ...s, ttsRate: next }))
    // A rate baked into an already-playing utterance can't change mid-sentence
    // (Web Speech) or mid-clip (Piper) -- restart the current sentence so the
    // new rate is heard immediately instead of at the next sentence boundary.
    if (status === 'playing') speakFrom(internal.current.i)
  }

  function setVoice(next: EngineVoice) {
    voiceRef.current = next
    setVoiceState(next)
    void getSettings().then(s => putSettings({ ...s, ttsVoiceURI: next.voiceId }))
    if (status === 'playing') speakFrom(internal.current.i)
  }

  function setEngine(next: TtsEngine) {
    // Switching engines mid-sentence would otherwise leave the old engine
    // talking (or, for Piper, an <audio> element playing) underneath the new
    // one -- stop() first, same as skip/pause does.
    stop()
    engineRef.current = next
    setEngineState(next)
    setStatus('idle')
    void getSettings().then(s => putSettings({ ...s, ttsEngine: next }))
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
    engine,
    setEngine,
    piperDownload,
    downloadPiperVoice: () => getPiperEngine().download(),
  }
}
