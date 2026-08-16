import { useState } from 'react'
import { Library } from './library/Library'
import { Reader } from './reader/Reader'
import { useSettings } from './settings'

type View = { kind: 'library' } | { kind: 'reader'; bookId: string }

export default function App() {
  const [view, setView] = useState<View>({ kind: 'library' })
  // Applies theme/font/scale to the whole app (library included), not
  // just the reader -- so it's called once here, at the top.
  const { settings, update } = useSettings()

  if (view.kind === 'reader') {
    return (
      <Reader
        bookId={view.bookId}
        settings={settings}
        onUpdateSettings={update}
        onClose={() => setView({ kind: 'library' })}
      />
    )
  }

  return <Library onOpen={bookId => setView({ kind: 'reader', bookId })} />
}
