import { useState } from 'react'
import { Library } from './library/Library'
import { Reader } from './reader/Reader'

type View = { kind: 'library' } | { kind: 'reader'; bookId: string }

export default function App() {
  const [view, setView] = useState<View>({ kind: 'library' })

  if (view.kind === 'reader') {
    return <Reader bookId={view.bookId} onClose={() => setView({ kind: 'library' })} />
  }

  return <Library onOpen={bookId => setView({ kind: 'reader', bookId })} />
}
