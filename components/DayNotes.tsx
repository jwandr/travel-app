'use client'

import { useState, useRef, useEffect } from 'react'
import { updateDay } from '@/lib/trips'

interface DayNotesProps {
  dayId: string
  initialNotes: string
  onChange?: (notes: string) => void
  compact?: boolean
}

export default function DayNotes({ dayId, initialNotes, onChange, compact = false }: DayNotesProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setNotes(initialNotes)
  }, [dayId])

  // Auto-expand textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [notes, editing])

  const handleChange = (val: string) => {
    setNotes(val)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updateDay(dayId, { notes: val })
        onChange?.(val)
      } finally {
        setSaving(false)
      }
    }, 800)
  }

  if (compact) {
    if (!editing) {
      return (
        <button
          onClick={() => setEditing(true)}
          className={`w-full text-left rounded-lg px-3 py-2 transition-colors border ${
            notes
              ? 'border-sky-100 bg-sky-50 hover:bg-sky-100'
              : 'border-dashed border-gray-200 hover:border-sky-300'
          }`}
        >
          {notes ? (
            <div className="flex items-start gap-1.5">
              <span className="material-symbols-rounded text-sky-400 shrink-0 mt-0.5" style={{ fontSize: 14 }}>edit_note</span>
              <span className="text-xs text-sky-800 line-clamp-2">{notes}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-rounded text-gray-300" style={{ fontSize: 14 }}>edit_note</span>
              <span className="text-xs text-gray-300">Add day notes…</span>
            </div>
          )}
        </button>
      )
    }

    return (
      <div className="border-2 border-sky-300 rounded-xl bg-sky-50 p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 uppercase tracking-wide">
            <span className="material-symbols-rounded" style={{ fontSize: 14 }}>edit_note</span>
            Day Notes
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-sky-400">Saving…</span>}
            <button onClick={() => setEditing(false)} className="text-xs text-sky-500 hover:text-sky-700 font-medium">Done</button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={notes}
          onChange={(e) => handleChange(e.target.value)}
          autoFocus
          placeholder="Jot down plans, reminders or ideas for this day…"
          className="w-full bg-transparent border-none outline-none text-xs text-sky-900 placeholder:text-sky-300 resize-none overflow-hidden"
          style={{ minHeight: '60px' }}
        />
      </div>
    )
  }

  // Full mode — day view
  return (
    <div
      onClick={() => !editing && setEditing(true)}
      className={`rounded-xl transition-all cursor-text border-2 ${
        editing
          ? 'border-sky-300 bg-sky-50 shadow-sm p-4'
          : notes
            ? 'border-sky-100 bg-sky-50 hover:border-sky-200 p-4'
            : 'border-dashed border-gray-200 hover:border-sky-300 px-3 py-2'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 uppercase tracking-wide">
          <span className="material-symbols-rounded" style={{ fontSize: 14 }}>edit_note</span>
          {(editing || notes) ? 'Day Notes' : (
            <span className="text-gray-300 font-normal normal-case tracking-normal">Add notes for this day…</span>
          )}
        </div>
        {editing && (
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-sky-400">Saving…</span>}
            {!saving && notes && <span className="text-xs text-sky-400">✓</span>}
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(false) }}
              className="text-xs text-sky-500 hover:text-sky-700 font-medium"
            >
              Done
            </button>
          </div>
        )}
      </div>

      {(editing || notes) && (
        <textarea
          ref={textareaRef}
          value={notes}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setEditing(true)}
          placeholder="Jot down plans, reminders or ideas…"
          className="w-full bg-transparent border-none outline-none text-sm text-sky-900 placeholder:text-sky-300 resize-none overflow-hidden mt-1"
          style={{ minHeight: '32px' }}
        />
      )}
    </div>
  )
}