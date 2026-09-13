import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface BookRecord {
  id: string
  title: string
  author: string
  cover: Blob | null
  file: Blob
  addedAt: number
  bytes: number
}

export interface ProgressRecord {
  bookId: string
  cfi: string
  fraction: number
  updatedAt: number
}

export interface AnnotationRecord {
  id: string
  bookId: string
  cfi: string
  text: string
  /** A word or two of surrounding text, for the highlights panel -- absent
   * on records written before that feature existed. */
  contextBefore?: string
  contextAfter?: string
  color: string
  note: string | null
  createdAt: number
  updatedAt: number
}

export type ThemeId = 'paper' | 'ink' | 'dusk' | 'slate'
export type FontFamily = 'theme' | 'literata' | 'source-serif' | 'crimson-pro' | 'atkinson'
export type Flow = 'paginated' | 'scrolled'

// Preview swatches live with the UI (settings.ts/SelectionToolbar.tsx); these
// are just the values, colocated with the schema like ThemeId/FontFamily are.
export const HIGHLIGHT_COLORS = ['#ffe066', '#8ce99a', '#74c0fc', '#ffa8cc'] as const

export type TtsEngine = 'system' | 'natural'

export interface SettingsRecord {
  key: 'app'
  themeId: ThemeId
  fontFamily: FontFamily
  fontScale: number
  lineHeight: number
  flow: Flow
  columns: 1 | 2
  ttsEngine: TtsEngine
  ttsRate: number
  ttsVoiceURI: string | null
  lastHighlightColor: string
}

interface SimplyBookDB extends DBSchema {
  books: { key: string; value: BookRecord }
  progress: { key: string; value: ProgressRecord }
  annotations: { key: string; value: AnnotationRecord; indexes: { byBook: string } }
  settings: { key: string; value: SettingsRecord }
}

const DEFAULT_SETTINGS: SettingsRecord = {
  key: 'app',
  themeId: 'paper',
  fontFamily: 'theme',
  fontScale: 1,
  lineHeight: 1.6,
  flow: 'paginated',
  columns: 2,
  ttsEngine: 'system',
  ttsRate: 1,
  ttsVoiceURI: null,
  lastHighlightColor: HIGHLIGHT_COLORS[0],
}

let dbPromise: Promise<IDBPDatabase<SimplyBookDB>> | undefined

function getDB() {
  dbPromise ??= openDB<SimplyBookDB>('simply-book', 1, {
    upgrade(db) {
      db.createObjectStore('books', { keyPath: 'id' })
      db.createObjectStore('progress', { keyPath: 'bookId' })
      db.createObjectStore('annotations', { keyPath: 'id' }).createIndex('byBook', 'bookId')
      db.createObjectStore('settings', { keyPath: 'key' })
    },
  })
  return dbPromise
}

export async function addBook(record: BookRecord): Promise<void> {
  const db = await getDB()
  await db.put('books', record)
}

export async function listBooks(): Promise<BookRecord[]> {
  const db = await getDB()
  return db.getAll('books')
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  const db = await getDB()
  return db.get('books', id)
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['books', 'progress', 'annotations'], 'readwrite')
  const annotations = tx.objectStore('annotations')
  const orphanedKeys = await annotations.index('byBook').getAllKeys(id)
  await Promise.all([
    tx.objectStore('books').delete(id),
    tx.objectStore('progress').delete(id),
    ...orphanedKeys.map(key => annotations.delete(key)),
    tx.done,
  ])
}

export async function listAnnotations(bookId: string): Promise<AnnotationRecord[]> {
  const db = await getDB()
  return db.getAllFromIndex('annotations', 'byBook', bookId)
}

export async function putAnnotation(record: AnnotationRecord): Promise<void> {
  const db = await getDB()
  await db.put('annotations', record)
}

export async function deleteAnnotation(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('annotations', id)
}

export async function getProgress(bookId: string): Promise<ProgressRecord | undefined> {
  const db = await getDB()
  return db.get('progress', bookId)
}

export async function putProgress(record: ProgressRecord): Promise<void> {
  const db = await getDB()
  await db.put('progress', record)
}

// Merged rather than returned bare: a settings row written before this
// schema grew new fields (e.g. a v0 install) would otherwise come back
// with `fontScale`/`flow`/etc. `undefined` instead of a usable default.
export async function getSettings(): Promise<SettingsRecord> {
  const db = await getDB()
  const stored = await db.get('settings', 'app')
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS
}

export async function putSettings(record: SettingsRecord): Promise<void> {
  const db = await getDB()
  await db.put('settings', record)
}
