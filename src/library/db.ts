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

// Unused in v0 (no highlights/notes yet) but declared now: a schema bump
// later costs more than one unused createObjectStore call today.
export interface AnnotationRecord {
  id: string
  bookId: string
  cfi: string
  text: string
  color: string
  note: string
  createdAt: number
}

export type ThemeId = 'paper' | 'ink' | 'dusk' | 'slate'
export type FontFamily = 'theme' | 'literata' | 'source-serif' | 'crimson-pro' | 'atkinson'
export type Flow = 'paginated' | 'scrolled'

export interface SettingsRecord {
  key: 'app'
  themeId: ThemeId
  fontFamily: FontFamily
  fontScale: number
  lineHeight: number
  flow: Flow
  columns: 1 | 2
  ttsRate: number
  ttsVoiceURI: string | null
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
  ttsRate: 1,
  ttsVoiceURI: null,
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
  const tx = db.transaction(['books', 'progress'], 'readwrite')
  await Promise.all([
    tx.objectStore('books').delete(id),
    tx.objectStore('progress').delete(id),
    tx.done,
  ])
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
