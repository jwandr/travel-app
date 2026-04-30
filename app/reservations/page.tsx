'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { updateItem, deleteItem } from '@/lib/trips'
import type { Item } from '@/lib/types'

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} style={{ fontSize: 20 }}>{name}</span>
}

const TYPE_CONFIG: Record<string, { label: string; icon: string; bg: string; text: string }> = {
  travel:    { label: 'Flight',    icon: 'flight',       bg: 'bg-sky-100',    text: 'text-sky-600' },
  transport: { label: 'Transport', icon: 'train',        bg: 'bg-green-100',  text: 'text-green-600' },
  stay:      { label: 'Stay',      icon: 'bed',          bg: 'bg-indigo-100', text: 'text-indigo-600' },
  activity:  { label: 'Activity',  icon: 'attractions',  bg: 'bg-amber-100',  text: 'text-amber-600' },
  food:      { label: 'Food',      icon: 'restaurant',   bg: 'bg-orange-100', text: 'text-orange-600' },
}

type Reservation = Item & { day_date: string; trip_name: string }

function DetailPanel({ item, onClose, onChange, onDelete }: {
  item: Reservation
  onClose: () => void
  onChange: (updated: Reservation) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState(item.title)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [confirmed, setConfirmed] = useState(item.confirmed ?? false)
  const [confirmation, setConfirmation] = useState(item.confirmation ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const cfg = TYPE_CONFIG[item.type]

  const save = async (fields: Partial<Item>) => {
    setSaving(true)
    try {
      const updated = await updateItem(item.id, fields)
      onChange({ ...item, ...updated })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-80 shrink-0 bg-white border-l border-gray-100 flex flex-col h-full">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cfg.bg}`}>
            <Icon name={cfg.icon} className={cfg.text} />
          </div>
          <div>
            <div className="text-xs text-gray-400">{cfg.label}</div>
            <div className="text-sm font-semibold text-gray-900 truncate max-w-[160px]">
              {item.title || 'Untitled'}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
          <input type="text" value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => save({ title: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Trip</label>
          <div className="text-sm text-gray-700">{item.trip_name}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <div className="text-sm text-gray-700">
            {new Date(item.day_date).toLocaleDateString('en-AU', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-500">Confirmation</label>
            <button onClick={() => { setConfirmed(!confirmed); save({ confirmed: !confirmed }) }}
              className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                confirmed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}>
              {confirmed ? 'Confirmed' : 'Unconfirmed'}
            </button>
          </div>
          <input type="text" value={confirmation} placeholder="e.g. PNR: ABC123"
            onChange={(e) => setConfirmation(e.target.value)}
            onBlur={(e) => save({ confirmation: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <textarea value={notes} rows={5} placeholder="Add notes…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={(e) => save({ notes: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-gray-100">
        <button
          onClick={async () => {
            setDeleting(true)
            try { await deleteItem(item.id); onDelete(item.id); onClose() }
            catch { setDeleting(false) }
          }}
          disabled={deleting}
          className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 disabled:opacity-50">
          <Icon name="delete" className="text-red-400" />
          {deleting ? 'Deleting…' : 'Delete reservation'}
        </button>
      </div>
    </div>
  )
}

export default function ReservationsPage() {
  const router = useRouter()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Reservation | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }

      // Fetch all confirmed items across all trips via join
      const { data: items, error } = await supabase
        .from('items')
        .select(`*, days!inner(date, trips!inner(name, created_by))`)
        .eq('confirmed', true)
        .eq('days.trips.created_by', data.user.id)

      if (!error && items) {
        const mapped: Reservation[] = items.map((item: any) => ({
          ...item,
          day_date: item.days.date,
          trip_name: item.days.trips.name,
        }))
        mapped.sort((a, b) => a.day_date.localeCompare(b.day_date))
        setReservations(mapped)
      }
      setLoading(false)
    }
    load()
  }, [router])

  // Group by date
  const grouped = reservations.reduce<Record<string, Reservation[]>>((acc, r) => {
    if (!acc[r.day_date]) acc[r.day_date] = []
    acc[r.day_date].push(r)
    return acc
  }, {})

  return (
    <AppShell>
      <div className="flex h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Reservations</h1>
              <p className="text-sm text-gray-400 mt-0.5">All your confirmed bookings in one place</p>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : reservations.length === 0 ? (
              <div className="text-center py-24 text-gray-400">
                <Icon name="confirmation_number" className="text-gray-200 !text-5xl block mx-auto mb-3" />
                <p className="text-sm">No confirmed reservations yet.</p>
                <p className="text-xs mt-1 text-gray-300">Mark items as confirmed in your trip itinerary.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(grouped).map(([date, items]) => (
                  <div key={date}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        {new Date(date).toLocaleDateString('en-AU', {
                          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </div>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const cfg = TYPE_CONFIG[item.type]
                        const active = selected?.id === item.id
                        return (
                          <div key={item.id} onClick={() => setSelected(active ? null : item)}
                            className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                              active
                                ? 'border-indigo-200 bg-indigo-50/50 shadow-sm'
                                : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                            }`}>
                            <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                              <Icon name={cfg.icon} className={cfg.text} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {item.title || 'Untitled'}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">{item.trip_name}</div>
                            </div>
                            <span className="shrink-0 text-xs px-2 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded-full font-medium">
                              Confirmed
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selected && (
          <DetailPanel
            key={selected.id}
            item={selected}
            onClose={() => setSelected(null)}
            onChange={(updated) => setReservations((prev) => prev.map((r) => r.id === updated.id ? updated : r))}
            onDelete={(id) => setReservations((prev) => prev.filter((r) => r.id !== id))}
          />
        )}
      </div>
    </AppShell>
  )
}