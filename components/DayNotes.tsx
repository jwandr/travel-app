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
  const [expanded, setExpanded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setNotes(initialNotes)
  }, [dayId])

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
    // Overview mode — collapsed preview, expand on click
    if (!notes && !expanded) {
      return (
        <button
          onClick={() => setExpanded(true)}
          className="w-full text-left text-xs text-gray-300 hover:text-gray-400 transition-colors py-1 flex items-center gap-1"
        >
          <span className="material-symbols-rounded" style={{ fontSize: 14 }}>edit_note</span>
          Add day notes…
        </button>
      )
    }

    if (!expanded && notes) {
      return (
        <button
          onClick={() => setExpanded(true)}
          className="w-full text-left text-xs text-gray-500 hover:text-gray-700 transition-colors py-1 line-clamp-2 flex items-start gap-1"
        >
          <span className="material-symbols-rounded shrink-0 mt-0.5" style={{ fontSize: 14 }}>edit_note</span>
          <span className="line-clamp-2">{notes}</span>
        </button>
      )
    }

    return (
      <div className="relative">
        <textarea
          value={notes}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => { if (!notes) setExpanded(false) }}
          autoFocus
          rows={3}
          placeholder="Add notes for this day…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
        />
        <div className="flex items-center justify-between mt-1">
          {saving
            ? <span className="text-xs text-gray-300">Saving…</span>
            : <span className="text-xs text-green-500">{notes ? '✓ Saved' : ''}</span>
          }
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // Full mode — always visible in day view
  return (
    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">
          <span className="material-symbols-rounded" style={{ fontSize: 14 }}>edit_note</span>
          Day Notes
        </div>
        {saving && <span className="text-xs text-amber-400">Saving…</span>}
        {!saving && notes && <span className="text-xs text-amber-400">✓ Saved</span>}
      </div>
      <textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        rows={3}
        placeholder="Jot down plans, reminders or ideas for this day…"
        className="w-full bg-transparent border-none outline-none text-sm text-amber-900 placeholder:text-amber-300 resize-none"
      />
    </div>
  )
}