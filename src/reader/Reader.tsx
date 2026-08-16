import { useFoliate } from './useFoliate'
import './Reader.css'

// Chrome.tsx/Rail.tsx/Toc.tsx (task 8) mount alongside reader__book once
// `view` is available; this is the minimal container + lifecycle wiring.
export function Reader({ bookId }: { bookId: string }) {
  const { view, containerRef } = useFoliate(bookId)

  return (
    <div className="reader">
      <div className="reader__book" ref={containerRef} />
      {!view && <div className="reader__loading">Opening…</div>}
    </div>
  )
}
