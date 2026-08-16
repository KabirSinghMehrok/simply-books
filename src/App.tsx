import { useState } from 'react'
import { Library } from './library/Library'

type View = { kind: 'library' } | { kind: 'reader'; bookId: string }

export default function App() {
  const [view, setView] = useState<View>({ kind: 'library' })

  if (view.kind === 'reader') {
    // Replaced by Reader.tsx in task 5.
    return <div>Opening book {view.bookId}…</div>
  }

  return <Library onOpen={bookId => setView({ kind: 'reader', bookId })} />
}
