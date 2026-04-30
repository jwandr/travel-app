'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getUserTrips, createTrip, deleteTrip } from '@/lib/trips'
import AppShell from '@/components/AppShell'
import type { Trip } from '@/lib/types'

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} style={{ fontSize: 20 }}>{name}</span>
}

function formatDateRange(startStr: string, days: number) {
  const start = new Date(startStr)
  const end = new Date(startStr)
  end.setDate(end.getDate() + days - 1)
  const s = start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const e = end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${s} – ${e}`
}

function CreateTripModal({ userId, onCreated, onClose }: {
  userId: string; onCreated: (trip: Trip) => void; onClose: () => void
}) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [duration, setDuration] = useState(7)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) return setError('Please enter a trip name.')
    if (!startDate) return setError('Please select a start date.')
    if (duration < 1 || duration > 90) return setError('Duration must be 1–90 days.')
    setSaving(true)
    setError('')
    try {
      const trip = await createTrip({ name: name.trim(), start_date: startDate, duration_days: duration, userId })
      onCreated(trip)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New Trip</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Trip name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder="e.g. Japan Spring 2026"
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
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Trip'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TripCard({ trip, onOpen, onDelete }: {
  trip: Trip & { is_owner: boolean }
  onOpen: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try { await deleteTrip(trip.id); onDelete() }
    catch { setDeleting(false); setConfirming(false) }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow group">
      {/* Shared indicator */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        trip.is_owner ? 'bg-indigo-50' : 'bg-violet-50'
      }`}>
        <Icon
          name={trip.is_owner ? 'luggage' : 'group'}
          className={trip.is_owner ? 'text-indigo-400' : 'text-violet-400'}
        />
      </div>

      <button className="flex-1 text-left min-w-0" onClick={onOpen}>
        <div className="flex items-center gap-2">
          <div className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
            {trip.name}
          </div>
          {!trip.is_owner && (
            <span className="shrink-0 text-xs px-2 py-0.5 bg-violet-50 text-violet-600 border border-violet-200 rounded-full font-medium">
              Shared
            </span>
          )}
        </div>
        <div className="text-sm text-gray-400 mt-0.5">
          {formatDateRange(trip.start_date, trip.duration_days)} · {trip.duration_days} days
        </div>
      </button>

      <div className="flex items-center gap-2 shrink-0">
        {trip.is_owner && (
          confirming ? (
            <>
              <span className="text-sm text-gray-500">Delete?</span>
              <button onClick={handleDelete} disabled={deleting}
                className="text-sm text-red-500 font-medium hover:text-red-700 disabled:opacity-50">
                {deleting ? '…' : 'Yes'}
              </button>
              <button onClick={() => setConfirming(false)} className="text-sm text-gray-400 hover:text-gray-600">No</button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)}
              className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
              <Icon name="delete" />
            </button>
          )
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [trips, setTrips] = useState<(Trip & { is_owner: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      setUser(data.user)
      const t = await getUserTrips(data.user.id)
      setTrips(t)
      setLoading(false)
    }
    load()
  }, [router])

  const myTrips = trips.filter((t) => t.is_owner)
  const sharedTrips = trips.filter((t) => !t.is_owner)

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">My Trips</h1>
            <button onClick={() => setShowCreate(true)}
              className="bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
              <Icon name="add" className="text-white" /> New Trip
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {myTrips.length === 0 && sharedTrips.length === 0 && (
                <div className="text-center py-24 text-gray-400">
                  <Icon name="luggage" className="text-gray-200 !text-5xl block mx-auto mb-4" />
                  <p className="text-sm">No trips yet. Create your first one!</p>
                </div>
              )}

              {myTrips.length > 0 && (
                <div className="space-y-3">
                  {myTrips.map((trip) => (
                    <TripCard
                      key={trip.id}
                      trip={trip}
                      onOpen={() => router.push(`/trip/${trip.id}`)}
                      onDelete={() => setTrips((prev) => prev.filter((t) => t.id !== trip.id))}
                    />
                  ))}
                </div>
              )}

              {sharedTrips.length > 0 && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Shared with me
                    </div>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <div className="space-y-3">
                    {sharedTrips.map((trip) => (
                      <TripCard
                        key={trip.id}
                        trip={trip}
                        onOpen={() => router.push(`/trip/${trip.id}`)}
                        onDelete={() => {}}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showCreate && user && (
        <CreateTripModal
          userId={user.id}
          onCreated={(trip) => {
            setShowCreate(false)
            router.push(`/trip/${trip.id}`)
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </AppShell>
  )
}