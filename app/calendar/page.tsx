'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getUserTrips } from '@/lib/trips'
import AppShell from '@/components/AppShell'
import MemberAvatars from '@/components/MemberAvatars'
import { getTripMembersForTrips } from '@/lib/trips'
import type { Trip } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month, day).getDay() // 0=Sun, 6=Sat
}

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = getDayOfWeek(year, month, day)
  return dow === 0 || dow === 6
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${fmt(s)} – ${fmt(e)}`
}

function tripEndDate(trip: Trip): string {
  const d = new Date(trip.start_date)
  d.setDate(d.getDate() + trip.duration_days - 1)
  return d.toISOString().split('T')[0]
}

// Colour palette for trips — cycles through
const TRIP_COLOURS = [
  { bg: 'bg-sky-400',     text: 'text-white',     light: 'bg-sky-50',     border: 'border-sky-200',     hex: '#38bdf8' },
  { bg: 'bg-violet-400',  text: 'text-white',     light: 'bg-violet-50',  border: 'border-violet-200',  hex: '#a78bfa' },
  { bg: 'bg-emerald-400', text: 'text-white',     light: 'bg-emerald-50', border: 'border-emerald-200', hex: '#34d399' },
  { bg: 'bg-amber-400',   text: 'text-white',     light: 'bg-amber-50',   border: 'border-amber-200',   hex: '#fbbf24' },
  { bg: 'bg-rose-400',    text: 'text-white',     light: 'bg-rose-50',    border: 'border-rose-200',    hex: '#fb7185' },
  { bg: 'bg-indigo-400',  text: 'text-white',     light: 'bg-indigo-50',  border: 'border-indigo-200',  hex: '#818cf8' },
  { bg: 'bg-teal-400',    text: 'text-white',     light: 'bg-teal-50',    border: 'border-teal-200',    hex: '#2dd4bf' },
  { bg: 'bg-orange-400',  text: 'text-white',     light: 'bg-orange-50',  border: 'border-orange-200',  hex: '#fb923c' },
]

function getTripColour(idx: number) {
  return TRIP_COLOURS[idx % TRIP_COLOURS.length]
}

// ─── Trip Detail Panel ────────────────────────────────────────────────────────

function TripDetailPanel({ trip, colour, members, onClose, onOpen }: {
  trip: Trip
  colour: typeof TRIP_COLOURS[0]
  members: { user_id: string; email: string; display_name?: string; avatar_url?: string }[]
  onClose: () => void
  onOpen: () => void
}) {
  const endDate = tripEndDate(trip)

  return (
    <>
      {/* Desktop side panel */}
      <div className="hidden md:flex w-72 shrink-0 bg-white border-l border-gray-100 flex-col h-full">
        {/* Cover image */}
        {trip.image_url ? (
          <div className="h-36 w-full overflow-hidden shrink-0">
            <img src={trip.image_url} alt={trip.name} className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
        ) : (
          <div className={`h-20 w-full shrink-0 ${colour.bg} flex items-center justify-center`}>
            <span className="material-symbols-rounded text-white" style={{ fontSize: 32 }}>flight_takeoff</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">{trip.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{formatDateRange(trip.start_date, endDate)}</p>
              <p className="text-xs text-gray-400">{trip.duration_days} days</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0 ml-2">
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>

          {members.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Travellers</div>
              <div className="flex items-center gap-2">
                <MemberAvatars members={members} size="md" max={6} />
                <span className="text-xs text-gray-400">
                  {members.map((m) => m.display_name || m.email.split('@')[0]).join(', ')}
                </span>
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Duration</div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full ${colour.light} ${colour.border} border`}>
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>calendar_month</span>
                {trip.duration_days} {trip.duration_days === 1 ? 'day' : 'days'}
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onOpen}
            className="w-full bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-sky-700 transition-colors flex items-center justify-center gap-2">
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>open_in_new</span>
            Open trip
          </button>
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-white rounded-t-2xl p-6 space-y-4"
          style={{ maxHeight: '80vh' }}>
          <div className="flex justify-center mb-2">
            <div className="w-10 h-1 bg-gray-200 rounded-full" />
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">{trip.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{formatDateRange(trip.start_date, endDate)}</p>
              <p className="text-xs text-gray-400">{trip.duration_days} days</p>
            </div>
            <button onClick={onClose} className="text-gray-400">
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>
          {members.length > 0 && (
            <div className="flex items-center gap-2">
              <MemberAvatars members={members} size="sm" max={6} />
              <span className="text-xs text-gray-400">
                {members.map((m) => m.display_name || m.email.split('@')[0]).join(', ')}
              </span>
            </div>
          )}
          <button onClick={onOpen}
            className="w-full bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-sky-700 transition-colors">
            Open trip
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Month Row ────────────────────────────────────────────────────────────────

const DAY_COL_WIDTH = 36 // px per day column
const MONTH_LABEL_WIDTH = 88 // px for month label
const DAYS_IN_LONGEST_MONTH = 31

function MonthRow({ year, month, trips, tripColours, memberMap, today, onSelectTrip, selectedTripId }: {
  year: number
  month: number
  trips: Trip[]
  tripColours: Record<string, typeof TRIP_COLOURS[0]>
  memberMap: Record<string, any[]>
  today: Date
  onSelectTrip: (trip: Trip) => void
  selectedTripId?: string
}) {
  const daysInMonth = getDaysInMonth(year, month)
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-AU', { month: 'short' })
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const todayDay = today.getDate()

  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  const overlappingTrips = trips.filter((trip) => {
    const end = tripEndDate(trip)
    return trip.start_date <= monthEnd && end >= monthStart
  })

  // Calculate row height based on number of overlapping trips
  const rowHeight = Math.max(32, overlappingTrips.length * 28 + 12)

  return (
    <div className="flex items-stretch border-b border-gray-100">
      {/* Month label */}
      <div
        className={`shrink-0 flex flex-col items-end justify-start pt-2 pr-3 border-r border-gray-200 ${
          isCurrentMonth ? 'text-sky-600' : 'text-gray-400'
        }`}
        style={{ width: MONTH_LABEL_WIDTH }}
      >
        <span className="text-xs font-bold tracking-wide">{monthLabel}</span>
        {isCurrentMonth && <span className="text-xs text-sky-400">now</span>}
      </div>

      {/* Day grid */}
      <div className="relative" style={{ minWidth: DAYS_IN_LONGEST_MONTH * DAY_COL_WIDTH, height: rowHeight }}>
        {/* Background day columns */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: DAYS_IN_LONGEST_MONTH }, (_, i) => {
            const day = i + 1
            const inMonth = day <= daysInMonth
            const weekend = inMonth && isWeekend(year, month, day)
            const isToday = isCurrentMonth && day === todayDay && inMonth

            let bgClass = ''
            if (!inMonth) bgClass = 'bg-gray-300/100'
            else if (weekend) bgClass = 'bg-gray-200/70'

            return (
              <div
                key={day}
                className={`shrink-0 h-full border-r border-gray-100 ${bgClass}`}
                style={{ width: DAY_COL_WIDTH }}
              >
                {isToday && (
                  <div className="absolute inset-y-0 border-l-2 border-sky-400 bg-sky-200/60 z-10"
                    style={{ left: (day - 1) * DAY_COL_WIDTH, width: DAY_COL_WIDTH }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Trip spans */}
        {overlappingTrips.map((trip, rowIdx) => {
          const end = tripEndDate(trip)
          const colour = tripColours[trip.id]

          const spanStart = trip.start_date < monthStart ? 1 : parseInt(trip.start_date.split('-')[2])
          const spanEnd = end > monthEnd ? daysInMonth : parseInt(end.split('-')[2])
          const startsThisMonth = trip.start_date >= monthStart
          const endsThisMonth = end <= monthEnd

          const left = (spanStart - 1) * DAY_COL_WIDTH + 3
          const width = (spanEnd - spanStart + 1) * DAY_COL_WIDTH - 6

          return (
            <div
              key={trip.id}
              className="absolute cursor-pointer z-20"
              style={{
                left,
                width,
                top: 6 + rowIdx * 26,
                height: 22,
              }}
              onClick={() => onSelectTrip(trip)}
            >
              <div className={`h-full flex items-center px-2.5 text-xs font-semibold text-white truncate shadow-sm transition-all ${
                colour.bg
              } ${selectedTripId === trip.id ? 'opacity-100 shadow-md scale-y-105' : 'opacity-90 hover:opacity-100'}
                ${startsThisMonth ? 'rounded-l-full' : ''}
                ${endsThisMonth ? 'rounded-r-full' : ''}
              `}>
                {startsThisMonth && (
                  <span className="truncate">{trip.name} - {trip.duration_days} days</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Year Section ─────────────────────────────────────────────────────────────

function YearSection({ year, trips, tripColours, memberMap, today, onSelectTrip, selectedTripId }: {
  year: number
  trips: Trip[]
  tripColours: Record<string, typeof TRIP_COLOURS[0]>
  memberMap: Record<string, any[]>
  today: Date
  onSelectTrip: (trip: Trip) => void
  selectedTripId?: string
}) {
  const daysInLongestMonth = 31

  return (
    <div className="mb-2">
      {/* Year header */}
      <div className="flex items-center border-b-2 border-gray-200 bg-white sticky top-0 z-20">
        <div className="shrink-0 py-2 pr-3 text-right" style={{ width: MONTH_LABEL_WIDTH }}>
          <span className="text-sm font-bold text-gray-900">{year}</span>
        </div>
        {/* Day number header */}
        <div className="flex overflow-hidden" style={{ minWidth: DAYS_IN_LONGEST_MONTH * DAY_COL_WIDTH }}>
          {Array.from({ length: DAYS_IN_LONGEST_MONTH }, (_, i) => {
            const day = i + 1
            const dow = new Date(year, 0, day).getDay()
            const isWeekendCol = dow === 0 || dow === 6
            return (
              <div
                key={day}
                className="shrink-0 text-center py-1.5 border-r border-gray-100"
                style={{ width: DAY_COL_WIDTH }}
              >
                <span className={`text-xs font-semibold ${isWeekendCol ? 'text-gray-300' : 'text-gray-300'}`}>
                  {day}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Month rows */}
      {Array.from({ length: 12 }, (_, month) => (
        <MonthRow
          key={month}
          year={year}
          month={month}
          trips={trips}
          tripColours={tripColours}
          memberMap={memberMap}
          today={today}
          onSelectTrip={onSelectTrip}
          selectedTripId={selectedTripId}
        />
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const router = useRouter()
  const [trips, setTrips] = useState<Trip[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const today = new Date()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }

      const t = await getUserTrips(data.user.id)
      setTrips(t)

      if (t.length > 0) {
        const map = await getTripMembersForTrips(t.map((trip) => trip.id))
        setMemberMap(map)
      }
      setLoading(false)
    }
    load()
  }, [router])

  // Scroll to current month on load
  useEffect(() => {
    if (loading || !scrollRef.current) return
    const currentMonthEl = scrollRef.current.querySelector('[data-current-month="true"]')
    if (currentMonthEl) {
      currentMonthEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      // Fallback — scroll proportionally through the year
      const monthFraction = today.getMonth() / 12
      const totalHeight = scrollRef.current.scrollHeight
      scrollRef.current.scrollTop = totalHeight * monthFraction - 200
    }
  }, [loading])

  // Assign colours to trips consistently
  const tripColours: Record<string, typeof TRIP_COLOURS[0]> = {}
  trips.forEach((trip, idx) => {
    tripColours[trip.id] = getTripColour(idx)
  })

  // Determine year range
  const years: number[] = []
  if (trips.length > 0) {
    const allYears = new Set<number>()
    trips.forEach((trip) => {
      const startYear = new Date(trip.start_date).getFullYear()
      const endYear = new Date(tripEndDate(trip)).getFullYear()
      for (let y = startYear; y <= endYear; y++) allYears.add(y)
    })
    // Also include current year
    allYears.add(today.getFullYear())
    const sorted = Array.from(allYears).sort()
    // Fill gaps between years
    for (let y = sorted[0]; y <= sorted[sorted.length - 1]; y++) years.push(y)
  } else {
    years.push(today.getFullYear())
  }

  const selectedTripColour = selectedTrip ? tripColours[selectedTrip.id] : null
  const selectedTripMembers = selectedTrip ? (memberMap[selectedTrip.id] ?? []) : []

  return (
    <AppShell>
      <div className="flex h-full overflow-hidden">
        {/* Main calendar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-gray-900">Calendar</h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  {trips.length} trip{trips.length !== 1 ? 's' : ''} across {years.length} year{years.length !== 1 ? 's' : ''}
                </p>
              </div>
              {/* Legend */}
              <div className="hidden sm:flex items-center gap-3 flex-wrap">
                {trips.slice(0, 6).map((trip) => (
                  <div key={trip.id} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-full ${tripColours[trip.id].bg}`} />
                    <span className="text-xs text-gray-500 truncate max-w-[100px]">{trip.name}</span>
                  </div>
                ))}
                {trips.length > 6 && (
                  <span className="text-xs text-gray-400">+{trips.length - 6} more</span>
                )}
              </div>
            </div>
          </div>

          {/* Calendar body */}
          <div ref={scrollRef} className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-300 text-sm animate-pulse">
                Loading calendar…
              </div>
            ) : (
              <div className="min-w-max">
                {years.map((year) => (
                  <div
                    key={year}
                    data-current-month={year === today.getFullYear() ? 'true' : undefined}
                  >
                    <YearSection
                      year={year}
                      trips={trips}
                      tripColours={tripColours}
                      memberMap={memberMap}
                      today={today}
                      onSelectTrip={(trip) => setSelectedTrip(
                        selectedTrip?.id === trip.id ? null : trip
                      )}
                      selectedTripId={selectedTrip?.id}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedTrip && selectedTripColour && (
          <TripDetailPanel
            trip={selectedTrip}
            colour={selectedTripColour}
            members={selectedTripMembers}
            onClose={() => setSelectedTrip(null)}
            onOpen={() => router.push(`/trip/${selectedTrip.id}`)}
          />
        )}
      </div>
    </AppShell>
  )
}