import type { EngineVoice, SpeakOpts, SpeechEngine } from './engine'
import { PIPER_VOICE_ID, type MainToWorker, type WorkerToMain } from './piper-protocol'

export type DownloadState =
  | { status: 'not-downloaded' }
  | { status: 'downloading'; loaded: number; total: number }
  | { status: 'ready' }
  | { status: 'error'; message: string }

const PIPER_VOICE: EngineVoice = { voiceId: PIPER_VOICE_ID, name: 'Lessac (Natural)', localService: true }
/** Model size at rest, for the opt-in copy -- this is a real network fetch, never started implicitly. */
export const PIPER_DOWNLOAD_MB = 63

/**
 * The main-thread half of the Piper engine: owns the worker, turns its WAV
 * Blob replies into real <audio> playback (so Media Session -- Phase D3 --
 * has a real media element to attach to), and prefetches the next sentence
 * while the current one plays so there's no audible gap at the boundary.
 */
export class PiperEngine implements SpeechEngine {
  private worker: Worker
  private nextRequestId = 0
  private pending = new Map<number, { resolve: (blob: Blob) => void; reject: (err: Error) => void }>()
  private prefetch: { text: string; promise: Promise<Blob> } | null = null
  private audio: HTMLAudioElement | null = null
  private audioUrl: string | null = null
  /** Set while a speak() is in flight; cancel() resolves it immediately, matching WebSpeechEngine.cancel(). */
  private inFlight: (() => void) | null = null
  private downloadListeners = new Set<(state: DownloadState) => void>()
  private downloadState: DownloadState = { status: 'not-downloaded' }

  constructor() {
    this.worker = new Worker(new URL('./piper.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<WorkerToMain>) => this.handleMessage(e.data)
  }

  private handleMessage(msg: WorkerToMain): void {
    if (msg.type === 'progress') {
      this.setDownloadState({ status: 'downloading', loaded: msg.loaded, total: msg.total })
    } else if (msg.type === 'ready') {
      this.setDownloadState({ status: 'ready' })
    } else if (msg.type === 'result') {
      this.pending.get(msg.id)?.resolve(msg.blob)
      this.pending.delete(msg.id)
    } else {
      if (msg.id !== undefined) {
        this.pending.get(msg.id)?.reject(new Error(msg.message))
        this.pending.delete(msg.id)
      }
      if (this.downloadState.status === 'downloading') this.setDownloadState({ status: 'error', message: msg.message })
    }
  }

  private setDownloadState(state: DownloadState): void {
    this.downloadState = state
    for (const listener of this.downloadListeners) listener(state)
  }

  getDownloadState(): DownloadState {
    return this.downloadState
  }

  /** Fires immediately with the current state, then on every change; returns the unsubscribe. */
  onDownloadState(listener: (state: DownloadState) => void): () => void {
    listener(this.downloadState)
    this.downloadListeners.add(listener)
    return () => this.downloadListeners.delete(listener)
  }

  /** The explicit opt-in: never call this except from a user action. */
  download(): void {
    if (this.downloadState.status === 'downloading' || this.downloadState.status === 'ready') return
    this.setDownloadState({ status: 'downloading', loaded: 0, total: 0 })
    this.post({ type: 'ensure' })
  }

  private post(message: MainToWorker): void {
    this.worker.postMessage(message)
  }

  private requestPredict(text: string): Promise<Blob> {
    const id = this.nextRequestId++
    const promise = new Promise<Blob>((resolve, reject) => this.pending.set(id, { resolve, reject }))
    this.post({ type: 'predict', id, text })
    return promise
  }

  private predictCached(text: string): Promise<Blob> {
    if (this.prefetch?.text === text) return this.prefetch.promise
    return this.requestPredict(text)
  }

  async voices(): Promise<EngineVoice[]> {
    return [PIPER_VOICE]
  }

  /** Resolves once a download already in progress settles; never starts one -- that's download()'s job alone. */
  private async ensureReady(): Promise<void> {
    if (this.downloadState.status !== 'downloading') return
    await new Promise<void>(resolve => {
      const unsub = this.onDownloadState(state => {
        if (state.status !== 'downloading') {
          unsub()
          resolve()
        }
      })
    })
  }

  async speak(text: string, opts: SpeakOpts): Promise<void> {
    // The opt-in gate: the driver should never let playback reach here before
    // downloadPiperVoice() has been called, but this is the backstop that
    // keeps a stray call from silently kicking off a ~60 MB fetch --
    // predictCached below would otherwise happily trigger the worker's own
    // lazy session init.
    if (this.downloadState.status === 'not-downloaded') return

    let resolve!: () => void
    const done = new Promise<void>(r => {
      resolve = r
    })
    this.inFlight = resolve

    // Set inFlight before this await, not after: a cancel() arriving while
    // still waiting on an in-progress download must invalidate this call
    // too, or its audio could start playing after the driver has already
    // moved its generation counter on.
    await this.ensureReady()
    if (this.inFlight !== resolve) return done // canceled while waiting for the download

    let blob: Blob
    try {
      blob = await this.predictCached(text)
    } catch {
      if (this.inFlight === resolve) this.inFlight = null
      resolve()
      return done
    }
    if (this.inFlight !== resolve) return done // canceled while synthesizing

    // Prefetch sentence n+1 while n plays -- Piper isn't instant like Web
    // Speech, so without this there's an audible gap at every boundary.
    if (opts.next) {
      const promise = this.requestPredict(opts.next)
      promise.catch(() => {}) // real consumption (and real error handling) happens in predictCached; this only stops an unhandled-rejection warning if the prefetch is discarded first, e.g. by cancel()
      this.prefetch = { text: opts.next, promise }
    } else {
      this.prefetch = null
    }

    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    this.audio = audio
    this.audioUrl = url
    audio.playbackRate = opts.rate
    audio.addEventListener('playing', () => opts.onStart?.(), { once: true })
    const finish = () => {
      if (this.audioUrl === url) {
        URL.revokeObjectURL(url)
        this.audioUrl = null
      }
      if (this.inFlight === resolve) this.inFlight = null
      resolve()
    }
    audio.addEventListener('ended', finish, { once: true })
    audio.addEventListener('error', finish, { once: true })
    void audio.play()
    return done
  }

  cancel(): void {
    this.audio?.pause()
    this.audio = null
    // pause() fires neither 'ended' nor 'error', so finish() above never
    // runs for it -- without this, every pause/skip (the normal way
    // playback stops, far more often than a sentence actually finishing on
    // its own) would leak that sentence's Blob URL for the rest of the tab's
    // lifetime.
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl)
      this.audioUrl = null
    }
    this.inFlight?.()
    this.inFlight = null
  }
}
