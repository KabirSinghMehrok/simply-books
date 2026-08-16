import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { makeBook } from 'foliate-js/view.js'
import { addBook, deleteBook, getProgress, listBooks, type BookRecord } from './db'
import { authors, flatten } from './meta'
import './Library.css'

interface Shelved {
  book: BookRecord
  coverUrl: string | null
  fraction: number
}

async function toShelved(book: BookRecord): Promise<Shelved> {
  const progress = await getProgress(book.id)
  return {
    book,
    coverUrl: book.cover ? URL.createObjectURL(book.cover) : null,
    fraction: progress?.fraction ?? 0,
  }
}

async function importEpub(file: File): Promise<void> {
  const parsed = await makeBook(file)
  const cover = await parsed.getCover()
  await addBook({
    id: crypto.randomUUID(),
    title: flatten(parsed.metadata.title) || file.name.replace(/\.epub$/i, ''),
    author: authors(parsed.metadata),
    cover,
    file,
    addedAt: Date.now(),
    bytes: file.size,
  })
}

function epubFilesFrom(list: FileList | File[]): File[] {
  return Array.from(list).filter(f => f.name.toLowerCase().endsWith('.epub'))
}

export function Library({ onOpen }: { onOpen: (bookId: string) => void }) {
  const [shelved, setShelved] = useState<Shelved[]>([])
  const [isDragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Mirrors `shelved` so cleanup (revoking object URLs) always sees the
  // latest list rather than the one captured when the effect first ran.
  const shelvedRef = useRef<Shelved[]>([])

  async function refresh() {
    const books = await listBooks()
    const next = await Promise.all(books.map(toShelved))
    next.sort((a, b) => b.book.addedAt - a.book.addedAt)
    for (const s of shelvedRef.current) if (s.coverUrl) URL.revokeObjectURL(s.coverUrl)
    shelvedRef.current = next
    setShelved(next)
  }

  // Runs once: refresh() is intentionally not a dependency, it's stable
  // enough for a mount-only effect and re-running it isn't the goal here.
  useEffect(() => {
    void refresh()
    return () => {
      for (const s of shelvedRef.current) if (s.coverUrl) URL.revokeObjectURL(s.coverUrl)
    }
  }, [])

  async function handleFiles(files: File[]) {
    for (const file of files) await importEpub(file)
    await refresh()
  }

  async function handleDelete(id: string, title: string, e: ReactMouseEvent) {
    e.stopPropagation()
    if (!confirm(`Remove "${title}" from your library?`)) return
    await deleteBook(id)
    await refresh()
  }

  return (
    <div
      className={`library${isDragging ? ' library--dragging' : ''}`}
      onDragOver={e => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        void handleFiles(epubFilesFrom(e.dataTransfer.files))
      }}
    >
      <header className="library__header">
        <h1>Your books</h1>
        <button className="library__add" onClick={() => fileInputRef.current?.click()}>
          <Plus size={16} /> Add EPUB
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".epub"
          multiple
          hidden
          onChange={e => {
            if (e.target.files) void handleFiles(epubFilesFrom(e.target.files))
            e.target.value = ''
          }}
        />
      </header>

      {shelved.length === 0 ? (
        <p className="library__empty">Drag an EPUB here, or add one to get started.</p>
      ) : (
        <div className="library__grid">
          {shelved.map(({ book, coverUrl, fraction }) => (
            <div key={book.id} className="card" onClick={() => onOpen(book.id)}>
              <button
                className="card__delete"
                aria-label={`Remove ${book.title}`}
                onClick={e => void handleDelete(book.id, book.title, e)}
              >
                <X size={14} />
              </button>
              <div className="card__cover">
                {coverUrl ? <img src={coverUrl} alt="" /> : <div className="card__cover-fallback" />}
                <div className="card__progress" style={{ width: `${fraction * 100}%` }} />
              </div>
              <div className="card__title">{book.title}</div>
              <div className="card__author">{book.author}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
