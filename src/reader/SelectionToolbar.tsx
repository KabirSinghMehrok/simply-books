import { StickyNote } from 'lucide-react'
import { HIGHLIGHT_COLORS } from '../library/db'
import './SelectionToolbar.css'

interface SelectionToolbarProps {
  rect: { left: number; top: number; right: number; bottom: number }
  onPick: (color: string) => void
  onNote: () => void
}

const WIDTH = 168

/** Floats above a text selection -- 4 highlight colors plus a note button. */
export function SelectionToolbar({ rect, onPick, onNote }: SelectionToolbarProps) {
  const center = (rect.left + rect.right) / 2
  const left = Math.min(Math.max(center - WIDTH / 2, 8), window.innerWidth - WIDTH - 8)
  const top = Math.max(rect.top - 48, 8)

  return (
    <div className="selection-toolbar" style={{ left, top }}>
      {HIGHLIGHT_COLORS.map(color => (
        <button
          key={color}
          className="selection-toolbar__swatch"
          style={{ background: color }}
          aria-label={`Highlight in ${color}`}
          onClick={() => onPick(color)}
        />
      ))}
      <button className="selection-toolbar__note" aria-label="Add note" onClick={onNote}>
        <StickyNote size={16} />
      </button>
    </div>
  )
}
