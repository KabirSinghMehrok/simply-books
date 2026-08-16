import { X } from 'lucide-react'
import type { FoliateView, TocItem } from 'foliate-js/view.js'
import './Toc.css'

function TocList({ items, onSelect }: { items: TocItem[]; onSelect: (href: string) => void }) {
  return (
    <ul className="toc__list">
      {items.map((item, i) => (
        <li key={i}>
          <button className="toc__item" onClick={() => onSelect(item.href)}>
            {item.label}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <TocList items={item.subitems} onSelect={onSelect} />
          )}
        </li>
      ))}
    </ul>
  )
}

export function Toc({ view, onClose }: { view: FoliateView; onClose: () => void }) {
  const items = view.book.toc ?? []

  function handleSelect(href: string) {
    void view.goTo(href)
    onClose()
  }

  return (
    <div className="toc">
      <div className="toc__header">
        <h2>Contents</h2>
        <button className="toc__close" onClick={onClose} aria-label="Close contents">
          <X size={16} />
        </button>
      </div>
      {items.length > 0 ? (
        <TocList items={items} onSelect={handleSelect} />
      ) : (
        <p className="toc__empty">No table of contents in this book.</p>
      )}
    </div>
  )
}
