// Shared between piper-engine.ts (main thread) and piper.worker.ts (worker
// thread) -- kept dependency-free so importing it from the main thread
// never pulls piper.worker.ts's own `@mintplex-labs/piper-tts-web` import
// along with it. That import belongs in the worker's bundle only.
export const PIPER_VOICE_ID = 'en_US-lessac-medium'

export type MainToWorker =
  | { type: 'ensure' } // download the model if needed, then init the ONNX session
  | { type: 'predict'; id: number; text: string }

export type WorkerToMain =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; blob: Blob }
  | { type: 'error'; id?: number; message: string }
