import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import './NoteEditor.css'

interface NoteEditorProps {
  color: string
  initialText: string
  onSave: (text: string) => void
  onDelete?: () => void
  onCancel: () => void
}

/** A note always implies a highlight (in `color`) -- this edits/saves the note, or removes the whole highlight. */
export function NoteEditor({ color, initialText, onSave, onDelete, onCancel }: NoteEditorProps) {
  const [text, setText] = useState(initialText)

  return (
    <div className="note-editor__backdrop" onClick={onCancel}>
      <div className="note-editor" onClick={e => e.stopPropagation()}>
        <div className="note-editor__header">
          <span className="note-editor__swatch" style={{ background: color }} />
          <button className="note-editor__close" onClick={onCancel} aria-label="Cancel">
            <X size={16} />
          </button>
        </div>
        <textarea
          className="note-editor__text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Note"
          autoFocus
        />
        <div className="note-editor__footer">
          {onDelete && (
            <button className="note-editor__delete" onClick={onDelete} aria-label="Remove highlight">
              <Trash2 size={16} />
            </button>
          )}
          <button className="note-editor__save" onClick={() => onSave(text.trim())}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
