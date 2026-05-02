'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragOverlay, useDroppable,
  type DragEndEvent, type DragStartEvent, type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  addItem, updateItem, deleteItem, updateTrip,
  getAccommodation, addAccommodation, updateAccommodation, deleteAccommodation,
} from '@/lib/trips'
import AppShell from '@/components/AppShell'
import ShareModal from '@/components/ShareModal'
import { supabase } from '@/lib/supabase'
import type { Trip, Day, Item, ItemType, Accommodation } from '@/lib/types'

// ─── Icon ─────────────────────────────────────────────────────────────────────

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-rounded ${className}`} style={{ fontSize: 20 }}>
      {name}
    </span>
  )
}

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ItemType, { label: string; bg: string; text: string; icon: string }> = {
  travel:    { label: 'Flight',    bg: 'bg-sky-100',    text: 'text-sky-600',    icon: 'flight' },
  transport: { label: 'Transport', bg: 'bg-green-100',  text: 'text-green-600',  icon: 'train' },
  activity:  { label: 'Activity',  bg: 'bg-amber-100',  text: 'text-amber-600',  icon: 'attractions' },
  food:      { label: 'Food',      bg: 'bg-orange-100', text: 'text-orange-600', icon: 'restaurant' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t?: string) {
  if (!t) return ''
  const [h, m] = t.split(':')
  return `${h}:${m}`
}

function formatDateRange(startStr: string, days: number) {
  const start = new Date(startStr)
  const end = new Date(startStr)
  end.setDate(end.getDate() + days - 1)
  const s = start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const e = end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${s} – ${e}`
}

function countByType(days: Day[], type: ItemType) {
  return days.flatMap((d) => d.items).filter((i) => i.type === type).length
}

function sortItemsByTime(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    if (!a.start_time && !b.start_time) return a.sort_order - b.sort_order
    if (!a.start_time) return 1
    if (!b.start_time) return -1
    return a.start_time.localeCompare(b.start_time)
  })
}

function getAccomForDate(accom: Accommodation[], date: string): Accommodation | undefined {
  return accom.find((a) => a.check_in <= date && a.check_out > date)
}

function prevDate(date: string) {
  const d = new Date(date); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]
}

function nextDate(date: string) {
  const d = new Date(date); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(mins: number): string {
  const capped = Math.max(0, Math.min(mins, 23 * 60 + 59))
  const h = Math.floor(capped / 60)
  const m = capped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function getDuration(item: Item): number {
  if (item.duration_minutes != null && item.duration_minutes > 0) return item.duration_minutes
  if (item.start_time && item.end_time) {
    const d = timeToMinutes(item.end_time) - timeToMinutes(item.start_time)
    return d > 0 ? d : 60
  }
  return 60
}

function fitItemsInWindow(items: Item[], windowStart: number, windowEnd: number): Item[] {
  const totalDuration = items.reduce((sum, i) => sum + getDuration(i), 0)
  const result: Item[] = []

  if (totalDuration <= windowEnd - windowStart) {
    let cursor = windowStart
    for (const item of items) {
      const duration = getDuration(item)
      const preferred = item.start_time ? timeToMinutes(item.start_time) : cursor
      const start = preferred >= cursor ? preferred : cursor
      const end = start + duration
      if (end <= windowEnd) {
        result.push({ ...item, start_time: minutesToTime(start), end_time: minutesToTime(end), duration_minutes: duration })
        cursor = end
      } else {
        result.push({ ...item, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + duration), duration_minutes: duration })
        cursor += duration
      }
    }
  } else {
    let cursor = windowEnd
    for (const item of [...items].reverse()) {
      const duration = getDuration(item)
      result.unshift({ ...item, start_time: minutesToTime(cursor - duration), end_time: minutesToTime(cursor), duration_minutes: duration })
      cursor -= duration
    }
  }
  return result
}

function cascadeItems(items: Item[]): Item[] {
  const valid = items.filter(Boolean)
  const timed = valid.filter((i) => i.start_time)
  const untimed = valid.filter((i) => !i.start_time)
  if (timed.length === 0) return [...untimed]

  const result: Item[] = []
  let i = 0
  while (i < timed.length) {
    if (timed[i].time_locked) {
      result.push(timed[i]); i++
    } else {
      const group: Item[] = []
      while (i < timed.length && !timed[i].time_locked) { group.push(timed[i]); i++ }
      const prevLocked = result.filter((x) => x.time_locked).slice(-1)[0]
      const nextLocked = timed.slice(i).find((x) => x.time_locked)
      const windowStart = prevLocked ? timeToMinutes(prevLocked.end_time!) : group[0].start_time ? timeToMinutes(group[0].start_time) : 8 * 60
      const windowEnd = nextLocked ? timeToMinutes(nextLocked.start_time!) : 24 * 60
      result.push(...fitItemsInWindow(group, windowStart, windowEnd))
    }
  }
  return [...result, ...untimed]
}

function reorderAndCascade(items: Item[], oldIndex: number, newIndex: number): Item[] {
  const valid = items.filter(Boolean)
  const reordered = arrayMove([...valid], oldIndex, newIndex)
  return cascadeItems(reordered)
}

function autoAssignTimes(items: Item[]): Item[] {
  const START_HOUR = 8
  let cursor = START_HOUR * 60
  return items.map((item) => {
    if (item.time_locked) return item
    const duration = getDuration(item)
    const start = cursor
    cursor = start + duration
    return { ...item, start_time: minutesToTime(start), end_time: minutesToTime(cursor), duration_minutes: duration }
  })
}

// ─── Edit Trip Modal ──────────────────────────────────────────────────────────

function EditTripModal({ trip, onSaved, onClose }: {
  trip: Trip; onSaved: (t: Trip) => void; onClose: () => void
}) {
  const [name, setName] = useState(trip.name)
  const [startDate, setStartDate] = useState(trip.start_date)
  const [duration, setDuration] = useState(trip.duration_days)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const datesChanged = startDate !== trip.start_date || duration !== trip.duration_days

  const handleSave = async () => {
    if (!name.trim()) return setError('Trip name is required.')
    if (!startDate) return setError('Start date is required.')
    if (duration < 1 || duration > 90) return setError('Duration must be 1–90 days.')
    setSaving(true)
    try {
      const updated = await updateTrip(trip.id, { name: name.trim(), start_date: startDate, duration_days: duration })
      onSaved(updated)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Edit Trip</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Trip name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (days)</label>
            <input type="number" value={duration} min={1} max={90}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {datesChanged && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700">⚠️ Changing dates will update day dates. Items on days beyond the new duration will be removed.</p>
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Accommodation Modal ──────────────────────────────────────────────────────

function AccomModal({ tripId, accom, tripStart, tripEnd, onSaved, onClose }: {
  tripId: string; accom?: Accommodation; tripStart: string; tripEnd: string
  onSaved: (a: Accommodation) => void; onClose: () => void
}) {
  const [name, setName] = useState(accom?.name ?? '')
  const [address, setAddress] = useState(accom?.address ?? '')
  const [checkIn, setCheckIn] = useState(accom?.check_in ?? tripStart)
  const [checkOut, setCheckOut] = useState(accom?.check_out ?? tripEnd)
  const [confirmation, setConfirmation] = useState(accom?.confirmation ?? '')
  const [confirmed, setConfirmed] = useState(accom?.confirmed ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) return setError('Name is required.')
    if (!checkIn || !checkOut) return setError('Check-in and check-out dates are required.')
    if (checkOut <= checkIn) return setError('Check-out must be after check-in.')
    setSaving(true)
    try {
      const saved = accom
        ? await updateAccommodation(accom.id, { name, address, check_in: checkIn, check_out: checkOut, confirmation, confirmed })
        : await addAccommodation(tripId, { name, address, check_in: checkIn, check_out: checkOut, confirmation, confirmed })
      onSaved(saved)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{accom ? 'Edit Accommodation' : 'Add Accommodation'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Hotel Kanra Kyoto"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Kyoto"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
              <input type="date" value={checkIn} min={tripStart} max={tripEnd} onChange={(e) => setCheckIn(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
              <input type="date" value={checkOut} min={tripStart} max={tripEnd} onChange={(e) => setCheckOut(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Confirmation</label>
              <button onClick={() => setConfirmed(!confirmed)}
                className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${confirmed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                {confirmed ? 'Confirmed' : 'Unconfirmed'}
              </button>
            </div>
            <input type="text" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="e.g. Booking ref #123"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Panel (desktop side panel + mobile bottom sheet) ─────────────────

function DetailPanel({ item, onClose, onChange, onDelete, onCascade }: {
  item: Item; onClose: () => void
  onChange: (updated: Item) => void
  onDelete: (id: string) => void
  onCascade: (updated: Item) => void
}) {
  const [tab, setTab] = useState<'details' | 'notes'>('details')
  const [title, setTitle] = useState(item.title)
  const [subtitle, setSubtitle] = useState(item.subtitle ?? '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [startTime, setStartTime] = useState(item.start_time ?? '')
  const [endTime, setEndTime] = useState(item.end_time ?? '')
  const [durationHours, setDurationHours] = useState(Math.floor(getDuration(item) / 60))
  const [durationMins, setDurationMins] = useState(getDuration(item) % 60)
  const [confirmed, setConfirmed] = useState(item.confirmed ?? false)
  const [confirmation, setConfirmation] = useState(item.confirmation ?? '')
  const [imageUrl, setImageUrl] = useState(item.image_url ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG['activity']

  useEffect(() => {
    setTitle(item.title)
    setSubtitle(item.subtitle ?? '')
    setStartTime(item.start_time ?? '')
    setEndTime(item.end_time ?? '')
    setDurationHours(Math.floor(getDuration(item) / 60))
    setDurationMins(getDuration(item) % 60)
    setConfirmed(item.confirmed ?? false)
    setConfirmation(item.confirmation ?? '')
    setImageUrl(item.image_url ?? '')
    setNotes(item.notes ?? '')
  }, [item.id])

  const saveField = (fields: Partial<Item>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        const updated = await updateItem(item.id, fields)
        onChange(updated)
      } finally {
        setSaving(false)
      }
    }, 600)
  }

  const handleStartTimeBlur = (val: string) => {
    if (!val) return
    const duration = durationHours * 60 + durationMins
    const newEnd = minutesToTime(timeToMinutes(val) + duration)
    setEndTime(newEnd)
    onCascade({ ...item, start_time: val, end_time: newEnd, duration_minutes: duration })
  }

  const handleEndTimeBlur = (val: string) => {
    if (!val || !startTime) return
    const duration = Math.max(0, timeToMinutes(val) - timeToMinutes(startTime))
    setDurationHours(Math.floor(duration / 60))
    setDurationMins(duration % 60)
    onCascade({ ...item, start_time: startTime, end_time: val, duration_minutes: duration })
  }

  const handleDurationBlur = () => {
    const duration = durationHours * 60 + durationMins
    if (!startTime) { saveField({ duration_minutes: duration }); return }
    const newEnd = minutesToTime(timeToMinutes(startTime) + duration)
    setEndTime(newEnd)
    onCascade({ ...item, start_time: startTime, end_time: newEnd, duration_minutes: duration })
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteItem(item.id)
      onDelete(item.id)
      onClose()
    } catch {
      setDeleting(false)
    }
  }

  const panelContent = (
    <>
      {imageUrl && (
        <div className="h-40 w-full overflow-hidden shrink-0">
          <img src={imageUrl} alt={title} className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
      )}

      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cfg.bg}`}>
            <Icon name={cfg.icon} className={cfg.text} />
          </div>
          <div>
            <div className="text-xs text-gray-400">{cfg.label}</div>
            <div className="text-sm font-semibold text-gray-900 truncate max-w-[160px]">{item.title || 'Untitled'}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
          <Icon name="close" />
        </button>
      </div>

      <div className="flex border-b border-gray-100 px-5 shrink-0">
        {(['details', 'notes'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`py-3 mr-5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t}
          </button>
        ))}
        {saving && <span className="ml-auto self-center text-xs text-gray-300">Saving…</span>}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {tab === 'details' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={(e) => saveField({ title: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Subtitle</label>
              <input type="text" value={subtitle} placeholder="e.g. Terminal 3 · Gate 22"
                onChange={(e) => setSubtitle(e.target.value)} onBlur={(e) => saveField({ subtitle: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Duration</label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 flex items-center gap-1">
                  <input type="number" min={0} max={23} value={durationHours}
                    onChange={(e) => setDurationHours(Number(e.target.value))} onBlur={handleDurationBlur}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <span className="text-xs text-gray-400 shrink-0">hr</span>
                </div>
                <div className="flex-1 flex items-center gap-1">
                  <input type="number" min={0} max={59} value={durationMins}
                    onChange={(e) => setDurationMins(Number(e.target.value))} onBlur={handleDurationBlur}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <span className="text-xs text-gray-400 shrink-0">min</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Start time</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} onBlur={(e) => handleStartTimeBlur(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">End time</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} onBlur={(e) => handleEndTimeBlur(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-xs font-medium text-gray-500">Lock time</div>
                <div className="text-xs text-gray-400 mt-0.5">Prevents this item moving when others are rescheduled</div>
              </div>
              <button onClick={async () => { const updated = await updateItem(item.id, { time_locked: !item.time_locked }); onChange(updated) }}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${item.time_locked ? 'bg-amber-400' : 'bg-gray-200'}`}>
                <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${item.time_locked ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500">Confirmation</label>
                <button onClick={() => { setConfirmed(!confirmed); saveField({ confirmed: !confirmed }) }}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${confirmed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {confirmed ? 'Confirmed' : 'Unconfirmed'}
                </button>
              </div>
              <input type="text" value={confirmation} placeholder="e.g. PNR: ABC123"
                onChange={(e) => setConfirmation(e.target.value)} onBlur={(e) => saveField({ confirmation: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Image URL</label>
              <input type="text" value={imageUrl} placeholder="https://…"
                onChange={(e) => setImageUrl(e.target.value)} onBlur={(e) => saveField({ image_url: e.target.value || undefined })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              {imageUrl && (
                <div className="mt-2 rounded-lg overflow-hidden h-24 bg-gray-50">
                  <img src={imageUrl} alt="preview" className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(TYPE_CONFIG) as ItemType[]).map((t) => (
                  <button key={t}
                    onClick={async () => { const updated = await updateItem(item.id, { type: t }); onChange(updated) }}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-opacity flex items-center gap-1 ${TYPE_CONFIG[t].bg} ${TYPE_CONFIG[t].text} ${item.type === t ? 'opacity-100' : 'opacity-30 hover:opacity-60'}`}>
                    <Icon name={TYPE_CONFIG[t].icon} className={`${TYPE_CONFIG[t].text} !text-sm`} />
                    {TYPE_CONFIG[t].label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'notes' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={notes} rows={8} placeholder="Add any notes here…"
              onChange={(e) => setNotes(e.target.value)} onBlur={(e) => saveField({ notes: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-gray-100 shrink-0">
        <button onClick={handleDelete} disabled={deleting}
          className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors disabled:opacity-50">
          <Icon name="delete" className="text-red-400" />
          {deleting ? 'Deleting…' : 'Delete item'}
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop: side panel */}
      <div className="hidden md:flex w-80 shrink-0 bg-white border-l border-gray-100 flex-col h-full">
        {panelContent}
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div
          className="relative bg-white rounded-t-2xl flex flex-col"
          style={{ maxHeight: '92vh' }}
          onTouchStart={(e) => {
            const touch = e.touches[0]
            ;(e.currentTarget as any)._touchStartY = touch.clientY
          }}
          onTouchEnd={(e) => {
            const startY = (e.currentTarget as any)._touchStartY
            const endY = e.changedTouches[0].clientY
            if (endY - startY > 80) onClose()
          }}
        >
          {/* Swipe handle — now functional */}
          <div className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab">
            <div className="w-10 h-1 bg-gray-200 rounded-full" />
          </div>
          {panelContent}
        </div>
      </div>
    </>
  )
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({ item, active, onClick, dragHandle }: {
  item: Item; active: boolean; onClick?: () => void
  dragHandle?: React.ReactNode
}) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG['activity']
  return (
    <div
      onClick={onClick}
      className={`flex items-center rounded-xl border cursor-pointer transition-all overflow-hidden ${
        active ? 'border-indigo-200 bg-indigo-50/50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
      }`}
      style={{ minHeight: item.image_url ? '72px' : undefined }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0 p-3">
        {dragHandle}
        <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${cfg.bg}`}>
          <Icon name={cfg.icon} className={cfg.text} />
        </div>
        <div className="w-14 shrink-0 text-right">
          {item.start_time && (
            <>
              <div className="text-xs font-medium text-gray-700">{formatTime(item.start_time)}</div>
              {item.end_time && <div className="text-xs text-gray-400">{formatTime(item.end_time)}</div>}
            </>
          )}
        </div>
        <div className="shrink-0">
          <div className={`w-2 h-2 rounded-full ${item.start_time ? cfg.bg.replace('100', '500') : 'bg-gray-200'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 pr-1">{item.title || <span className="text-gray-300 font-normal">Untitled item</span>}</div>
          {item.subtitle && <div className="text-xs text-gray-400 mt-0.5">{item.subtitle}</div>}
          {/* Confirmed badge inline on mobile */}
          {item.confirmed && (
            <span className="sm:hidden inline-flex mt-1 text-xs px-2 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded-full font-medium">
              Confirmed
            </span>
          )}
        </div>
        {item.time_locked && <Icon name="lock" className="text-amber-400 !text-base shrink-0" />}
        {/* Confirmed badge on desktop only */}
        {item.confirmed && (
          <span className="hidden sm:inline-flex shrink-0 text-xs px-2 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded-full font-medium">
            Confirmed
          </span>
        )}
      </div>
      {item.image_url && (
        <div className="hidden sm:block w-20 self-stretch shrink-0">
          <img src={item.image_url} alt={item.title} className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
      )}
    </div>
  )
}

// ─── Sortable Item ────────────────────────────────────────────────────────────

function SortableItem({ item, active, onClick }: {
  item: Item; active: boolean; onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { item } })

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }

  const handle = item.time_locked ? (
    <div className="shrink-0 text-amber-400"><Icon name="lock" /></div>
  ) : (
    <button {...attributes} {...listeners}
      className="shrink-0 text-gray-200 hover:text-gray-400 transition-colors cursor-grab active:cursor-grabbing touch-none"
      onClick={(e) => e.stopPropagation()}>
      <Icon name="drag_indicator" />
    </button>
  )

  return (
    <div ref={setNodeRef} style={style}>
      <ItemCard item={item} active={active} onClick={onClick} dragHandle={handle} />
    </div>
  )
}

// ─── Day Drop Zone ────────────────────────────────────────────────────────────

function DayDropZone({ day, accom, items, selectedId, onClickItem, onAdd, isOver, onAddAccom }: {
  day: Day; accom: Accommodation[]; items: Item[]
  selectedId: string | null
  onClickItem: (item: Item) => void
  onAdd: (type: ItemType) => void
  isOver: boolean
  onAddAccom: () => void
}) {
  const { setNodeRef } = useDroppable({ id: day.id })
  const dayAccom = getAccomForDate(accom, day.date)
  const d = new Date(day.date)

  return (
    <div className={`rounded-2xl border-2 transition-colors p-4 ${isOver ? 'border-indigo-300 bg-indigo-50/40' : 'border-transparent'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-white">{day.day_index}</span>
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-900">
            {d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        {isOver && <span className="text-xs text-indigo-500 font-medium">Drop here</span>}
      </div>

      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`space-y-2 min-h-[56px] rounded-xl transition-colors ${isOver && items.length === 0 ? 'bg-indigo-50 border-2 border-dashed border-indigo-200' : ''}`}>
          {items.length === 0 && isOver && (
            <div className="flex items-center justify-center h-14 text-xs text-indigo-400 font-medium">Drop here</div>
          )}
          {items.map((item) => (
            <SortableItem key={item.id} item={item} active={selectedId === item.id} onClick={() => onClickItem(item)} />
          ))}
        </div>
      </SortableContext>

      <AddItemRow onAdd={onAdd} />

      {/* Tonight's stay */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tonight's Stay</div>
        {dayAccom ? (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
            <Icon name="bed" className="text-indigo-400 shrink-0 !text-base" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-indigo-800">{dayAccom.name}</span>
              {dayAccom.address && <span className="text-xs text-indigo-400 ml-1">· {dayAccom.address}</span>}
            </div>
          </div>
        ) : (
          <button onClick={onAddAccom}
            className="w-full flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors">
            <Icon name="add" className="text-current !text-sm" /> Add accommodation
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Add Item Row ─────────────────────────────────────────────────────────────

function AddItemRow({ onAdd }: { onAdd: (type: ItemType) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative mt-2">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors">
        <Icon name="add" className="text-current" /> Add item
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-10 p-2 flex flex-wrap gap-1.5">
          {(Object.keys(TYPE_CONFIG) as ItemType[]).map((t) => (
            <button key={t} onClick={() => { onAdd(t); setOpen(false) }}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium ${TYPE_CONFIG[t].bg} ${TYPE_CONFIG[t].text}`}>
              <Icon name={TYPE_CONFIG[t].icon} className={`${TYPE_CONFIG[t].text} !text-sm`} />
              {TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ trip, days }: { trip: Trip; days: Day[] }) {
  const stats = [
    { icon: 'calendar_month', value: trip.duration_days,            label: 'Days' },
    { icon: 'flight',         value: countByType(days, 'travel'),    label: 'Flights' },
    { icon: 'attractions',    value: countByType(days, 'activity'),  label: 'Activities' },
    { icon: 'restaurant',     value: countByType(days, 'food'),      label: 'Dining' },
    { icon: 'train',          value: countByType(days, 'transport'), label: 'Transport' },
  ]
  return (
    <div className="border-t border-gray-100 bg-white px-4 py-2 flex items-center gap-4 shrink-0 overflow-x-auto">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2 shrink-0">
          <Icon name={s.icon} className="text-indigo-400 !text-lg" />
          <div>
            <div className="text-sm font-bold text-gray-900 leading-none">{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

const OVERVIEW_ID = '__overview__'

export default function TripView({ trip: initialTrip, days: initialDays, userId }: {
  trip: Trip; days: Day[]; userId: string
}) {
  const router = useRouter()
  const [trip, setTrip] = useState<Trip>(initialTrip)
  const [days, setDays] = useState<Day[]>(initialDays)
  const [activeTabId, setActiveTabId] = useState(OVERVIEW_ID)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [accom, setAccom] = useState<Accommodation[]>([])
  const [accomModal, setAccomModal] = useState<{ open: boolean; accom?: Accommodation; defaultDate?: string }>({ open: false })
  const [activeDragItem, setActiveDragItem] = useState<Item | null>(null)
  const [overDayId, setOverDayId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  useEffect(() => {
    getAccommodation(trip.id).then(setAccom)
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
  }, [trip.id])

  const isOverview = activeTabId === OVERVIEW_ID
  const activeDay = isOverview ? null : days.find((d) => d.id === activeTabId) ?? null
  const singleDayItems = sortItemsByTime(activeDay?.items ?? [])
  const todayAccom = activeDay ? getAccomForDate(accom, activeDay.date) : undefined

  const tripEnd = (() => {
    const d = new Date(trip.start_date)
    d.setDate(d.getDate() + trip.duration_days - 1)
    return d.toISOString().split('T')[0]
  })()

  const findDayForItem = (itemId: string): Day | undefined =>
    days.find((d) => d.items.some((i) => i.id === itemId))

  const handleDragStart = (event: DragStartEvent) => {
    const item = event.active.data.current?.item as Item | undefined
    if (item) setActiveDragItem(item)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over) { setOverDayId(null); return }
    const overId = over.id as string
    const overDay = days.find((d) => d.id === overId)
    if (overDay) { setOverDayId(overDay.id); return }
    const overItemDay = findDayForItem(overId)
    if (overItemDay) setOverDayId(overItemDay.id)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragItem(null)
    setOverDayId(null)
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string
    const sourceDay = findDayForItem(activeId)
    if (!sourceDay) return

    const targetDayById = days.find((d) => d.id === overId)
    const targetDayByItem = findDayForItem(overId)
    const targetDay = targetDayById ?? targetDayByItem
    if (!targetDay) return

    const isSameDay = sourceDay.id === targetDay.id

    if (isSameDay) {
      const sorted = sortItemsByTime(sourceDay.items)
      const oldIndex = sorted.findIndex((i) => i.id === activeId)
      const newIndex = sorted.findIndex((i) => i.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const withTimes = reorderAndCascade(sorted, oldIndex, newIndex)
      setDays((prev) => prev.map((d) => d.id === sourceDay.id ? { ...d, items: withTimes } : d))
      await Promise.all(withTimes.map((item, idx) =>
        updateItem(item.id, { sort_order: idx, start_time: item.start_time, end_time: item.end_time, duration_minutes: item.duration_minutes })
      ))
      if (selectedItem) {
        const refreshed = withTimes.find((i) => i.id === selectedItem.id)
        if (refreshed) setSelectedItem(refreshed)
      }
    } else {
      const movingItem = sourceDay.items.find((i) => i.id === activeId)
      if (!movingItem) return
      const updatedItem = { ...movingItem, day_id: targetDay.id }
      setDays((prev) => prev.map((d) => {
        if (d.id === sourceDay.id) return { ...d, items: d.items.filter((i) => i.id !== activeId) }
        if (d.id === targetDay.id) return { ...d, items: [...d.items, updatedItem] }
        return d
      }))
      await updateItem(activeId, { day_id: targetDay.id, sort_order: targetDay.items.length })
      if (selectedItem?.id === activeId) setSelectedItem(updatedItem)
    }
  }

  const handleSingleDayDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragItem(null)
    if (!over || active.id === over.id) return

    const currentDay = days.find((d) => d.id === activeTabId)
    if (!currentDay) return

    const currentItems = sortItemsByTime([...currentDay.items])
    const oldIndex = currentItems.findIndex((i) => i.id === active.id)
    const newIndex = currentItems.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    const withTimes = reorderAndCascade(currentItems, oldIndex, newIndex)

    setDays((prev) => prev.map((d) =>
      d.id === currentDay.id ? { ...d, items: withTimes.map((item) => ({ ...item })) } : d
    ))

    await Promise.all(withTimes.map((item, idx) =>
      updateItem(item.id, { sort_order: idx, start_time: item.start_time, end_time: item.end_time, duration_minutes: item.duration_minutes })
    ))

    if (selectedItem) {
      const refreshed = withTimes.find((i) => i.id === selectedItem.id)
      if (refreshed) setSelectedItem({ ...refreshed })
    }
  }

  const handleChange = (updated: Item) => {
    setDays((prev) => prev.map((d) => ({ ...d, items: d.items.map((i) => i.id === updated.id ? updated : i) })))
    setSelectedItem((prev) => prev?.id === updated.id ? updated : prev)
  }

  const handleDelete = (id: string) => {
    setDays((prev) => prev.map((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) })))
    setSelectedItem(null)
  }

  const handleAdd = async (dayId: string, type: ItemType) => {
    const day = days.find((d) => d.id === dayId)
    if (!day) return
    const newItem = await addItem(dayId, trip.id, type)
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, items: [...d.items, newItem] } : d))
    setSelectedItem(newItem)
  }

  const handleTripSaved = (updated: Trip) => {
    setTrip(updated)
    setShowEdit(false)
    if (updated.start_date !== trip.start_date || updated.duration_days !== trip.duration_days) {
      window.location.reload()
    }
  }

  const cascadeDayFromItem = async (updatedItem: Item) => {
    const day = days.find((d) => d.items.some((i) => i.id === updatedItem.id))
    if (!day) return
    const dayItems = sortItemsByTime(day.items.map((i) => i.id === updatedItem.id ? updatedItem : i))
    const cascaded = cascadeItems(dayItems)
    setDays((prev) => prev.map((d) => d.id === day.id ? { ...d, items: cascaded } : d))
    setSelectedItem((prev) => prev ? (cascaded.find((i) => i.id === prev.id) ?? prev) : null)
    await Promise.all(cascaded.map((item, idx) =>
      updateItem(item.id, { sort_order: idx, start_time: item.start_time, end_time: item.end_time, duration_minutes: item.duration_minutes })
    ))
  }

  return (
    <AppShell>
      <div className="flex flex-col h-full">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 truncate">{trip.name}</h1>
                <button onClick={() => setShowEdit(true)} className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                  <Icon name="edit" />
                </button>
              </div>
              <p className="hidden sm:block text-xs text-gray-400 mt-0.5">
                {formatDateRange(trip.start_date, trip.duration_days)} · {trip.duration_days} days
              </p>
            </div>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              <button onClick={() => setShowShare(true)}
                className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium">
                <Icon name="group_add" className="text-white !text-base" />
                <span className="hidden sm:inline">Share</span>
              </button>
              <button onClick={() => router.push('/dashboard')}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
                <Icon name="arrow_back" />
                <span className="hidden sm:inline">Back</span>
              </button>
            </div>
          </div>

          {/* Day tabs */}
          <div className="mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <div className="flex gap-1" style={{ width: 'max-content' }}>
              <button onClick={() => setActiveTabId(OVERVIEW_ID)}
                className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs shrink-0 transition-colors border ${
                  isOverview ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-transparent text-gray-400 hover:bg-gray-50'
                }`} style={{ minWidth: '80px' }}>
                <span className={`font-semibold text-sm ${isOverview ? 'text-indigo-700' : 'text-gray-700'}`}>Overview</span>
                <span>All days</span>
              </button>

              {days.map((day) => {
                const d = new Date(day.date)
                const active = day.id === activeTabId
                return (
                  <button key={day.id} onClick={() => setActiveTabId(day.id)}
                    className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs shrink-0 transition-colors border ${
                      active ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-transparent text-gray-400 hover:bg-gray-50'
                    }`} style={{ minWidth: '80px' }}>
                    <span className={`font-semibold text-sm ${active ? 'text-indigo-700' : 'text-gray-700'}`}>
                      {d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className={active ? 'text-indigo-400' : 'text-gray-400'}>
                      {d.toLocaleDateString('en-AU', { weekday: 'short' })} · Day {day.day_index}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {isOverview ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter}
                onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
                <div className="space-y-4 max-w-2xl mx-auto">
                  {days.map((day) => (
                    <DayDropZone
                      key={day.id} day={day} accom={accom}
                      items={sortItemsByTime(day.items)}
                      selectedId={selectedItem?.id ?? null}
                      onClickItem={(item) => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                      onAdd={(type) => handleAdd(day.id, type)}
                      isOver={overDayId === day.id}
                      onAddAccom={() => setAccomModal({ open: true, defaultDate: day.date })}
                    />
                  ))}
                </div>
                <DragOverlay>
                  {activeDragItem && (
                    <div className="shadow-2xl rotate-1 opacity-95">
                      <ItemCard item={activeDragItem} active={false} />
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            ) : (
              <>
                {activeDay && (
                  <p className="text-sm text-gray-400 mb-4 max-w-2xl mx-auto">
                    {new Date(activeDay.date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}

                <DndContext sensors={sensors} collisionDetection={closestCenter}
                  onDragStart={handleDragStart} onDragEnd={handleSingleDayDragEnd}>
                  <SortableContext items={singleDayItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 max-w-2xl mx-auto">
                      {singleDayItems.length === 0 && (
                        <div className="text-center py-16 text-gray-300 text-sm">Nothing planned yet — add something below.</div>
                      )}
                      {singleDayItems.map((item) => (
                        <SortableItem key={item.id} item={item}
                          active={selectedItem?.id === item.id}
                          onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)} />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {activeDragItem && (
                      <div className="shadow-2xl rotate-1 opacity-95 max-w-2xl">
                        <ItemCard item={activeDragItem} active={false} />
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>

                <div className="max-w-2xl mx-auto mt-2">
                  {activeDay && <AddItemRow onAdd={(type) => handleAdd(activeDay.id, type)} />}
                </div>

                {/* Tonight's stay */}
                <div className="max-w-2xl mx-auto mt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tonight's Stay</div>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  {todayAccom ? (
                    <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                      <Icon name="bed" className="text-indigo-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-indigo-900">{todayAccom.name}</div>
                        {todayAccom.address && <div className="text-xs text-indigo-400 mt-0.5">{todayAccom.address}</div>}
                        {todayAccom.confirmed && (
                          <div className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                            <Icon name="check_circle" className="text-green-500 !text-xs" />
                            Confirmed{todayAccom.confirmation && ` · ${todayAccom.confirmation}`}
                          </div>
                        )}
                      </div>
                      <button onClick={() => setAccomModal({ open: true, accom: todayAccom })}
                        className="text-indigo-400 hover:text-indigo-600 shrink-0">
                        <Icon name="edit" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setAccomModal({ open: true })}
                      className="w-full flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors">
                      <Icon name="bed" className="text-current" /> Add accommodation for this night
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Desktop detail panel */}
          {selectedItem && (
            <div className="hidden md:flex">
              <DetailPanel
                key={selectedItem.id} item={selectedItem}
                onClose={() => setSelectedItem(null)}
                onChange={handleChange} onDelete={handleDelete} onCascade={cascadeDayFromItem}
              />
            </div>
          )}
        </div>

        <div className="hidden sm:block">
          <StatsBar trip={trip} days={days} />
        </div>
      </div>

      {/* Mobile detail panel — outside the scroll container */}
      {selectedItem && (
        <div className="md:hidden">
          <DetailPanel
            key={selectedItem.id} item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onChange={handleChange} onDelete={handleDelete} onCascade={cascadeDayFromItem}
          />
        </div>
      )}

      {showEdit && <EditTripModal trip={trip} onSaved={handleTripSaved} onClose={() => setShowEdit(false)} />}
      {showShare && <ShareModal trip={trip} userId={userId} userEmail={userEmail} onClose={() => setShowShare(false)} />}
      {accomModal.open && (
        <AccomModal
          tripId={trip.id} accom={accomModal.accom}
          tripStart={trip.start_date} tripEnd={tripEnd}
          onSaved={(a) => {
            setAccom((prev) => {
              const exists = prev.find((x) => x.id === a.id)
              return exists ? prev.map((x) => x.id === a.id ? a : x) : [...prev, a]
            })
            setAccomModal({ open: false })
          }}
          onClose={() => setAccomModal({ open: false })}
        />
      )}
    </AppShell>
  )
}