// Runs Piper (VITS) inference off the main thread. This is NOT optional
// plumbing: @mintplex-labs/piper-tts-web's own predict() doc comment claims
// it "runs in a new worker thread", but its shipped bundle contains no
// `new Worker(...)` anywhere -- inference actually runs wherever you call
// it. Calling it from the main thread stalls paging for hundreds of ms per
// sentence, so this file is the worker the library doesn't provide itself.
//
// Deliberately bypasses the package's top-level predict()/download() helpers
// in favor of TtsSession directly: predict() always constructs a session
// with the library's default wasmPaths (onnxruntime-web's runtime from
// cdnjs, piper_phonemize from jsdelivr), and there is no way to override
// that through predict()'s own signature. TtsSession's constructor is the
// only place wasmPaths can be redirected to our self-hosted copies under
// public/wasm/, per CLAUDE.md's no-external-runtime-dependency stance.
import { stored, TtsSession } from '@mintplex-labs/piper-tts-web'
import { PIPER_VOICE_ID, type MainToWorker, type WorkerToMain } from './piper-protocol'
// onnxruntime-web dynamically `import()`s this glue module at runtime (not a
// fetch -- confirmed in node_modules/onnxruntime-web/dist/ort.wasm.min.mjs),
// so unlike the .wasm/.data binaries below it can't just sit under public/:
// Vite's dev server refuses to serve a public-dir file through ESM import
// semantics ("can only be referenced via HTML tags"). Importing it with
// `?url` instead makes Vite process it like any other source asset, which
// works in both dev and prod.
import onnxMjsUrl from './vendor/ort-wasm-simd-threaded.mjs?url'

// piper-tts-web's own TtsSessionOptions types `wasmPaths.onnxWasm` as a plain
// string (a directory prefix), but its constructor forwards it verbatim to
// onnxruntime-web's `env.wasm.wasmPaths`, which also accepts a `{ mjs, wasm }`
// object of exact URLs -- required here since Vite gives the .mjs (bundled,
// content-hashed) and .wasm (a public/ passthrough) files unrelated paths
// that don't share a common prefix. The cast is bypassing an overly narrow
// third-party type, not the runtime contract underneath it.
const ONNX_WASM_PATHS = { mjs: onnxMjsUrl, wasm: '/wasm/onnx/ort-wasm-simd-threaded.wasm' } as unknown as string

const WASM_PATHS = {
  onnxWasm: ONNX_WASM_PATHS,
  piperWasm: '/wasm/piper/piper_phonemize.wasm',
  piperData: '/wasm/piper/piper_phonemize.data',
}

// Scoped to this module rather than pulled from the `webworker` lib, which
// can't coexist with the `dom` lib the rest of the app's tsconfig needs.
declare const self: {
  postMessage(message: WorkerToMain): void
  onmessage: ((ev: MessageEvent<MainToWorker>) => void) | null
}

let sessionPromise: Promise<TtsSession> | null = null

function ensureSession(): Promise<TtsSession> {
  sessionPromise ??= TtsSession.create({
    voiceId: PIPER_VOICE_ID,
    wasmPaths: WASM_PATHS,
    progress: p => {
      // predict() reuses this same callback for long-text chunk progress
      // (a different Progress shape, keyed by INFERENCE_PROGRESS_URL) --
      // only the model-download progress is interesting here.
      if (p.url !== 'tts://inference-progress') self.postMessage({ type: 'progress', loaded: p.loaded, total: p.total })
    },
  })
  return sessionPromise
}

self.onmessage = (e: MessageEvent<MainToWorker>) => {
  const msg = e.data
  if (msg.type === 'check') {
    stored()
      .then(ids => self.postMessage({ type: 'stored', has: ids.includes(PIPER_VOICE_ID) }))
      .catch(() => self.postMessage({ type: 'stored', has: false }))
  } else if (msg.type === 'ensure') {
    ensureSession()
      .then(() => self.postMessage({ type: 'ready' }))
      .catch((err: unknown) => self.postMessage({ type: 'error', message: String(err) }))
  } else {
    ensureSession()
      .then(session => session.predict(msg.text))
      .then(blob => self.postMessage({ type: 'result', id: msg.id, blob }))
      .catch((err: unknown) => self.postMessage({ type: 'error', id: msg.id, message: String(err) }))
  }
}
