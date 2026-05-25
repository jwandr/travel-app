'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import {
  fetchItinerary, saveLeg, deleteLeg as dbDeleteLeg,
  deleteActivity as dbDeleteActivity, deleteAccomNote as dbDeleteAccomNote,
  updateItinerary, getItineraryMembers, removeItineraryMember,
  getPendingItineraryInvites, inviteToItinerary, removeItineraryInvite,
} from '@/lib/itinerary'
import { computeBudget } from '@/lib/types'
import type {
  Itinerary, ItineraryLeg, TransitDetail, Activity, AccomNote,
  ItineraryMode, FareType, ActivityTier, AccomType, BookingStatus,
  ItineraryRow, ItineraryMemberRow, ItineraryInviteRow, ItineraryRole,
  BudgetSummary,
} from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
function fmtDateRange(start: Date, days: number) {
  return `${fmtDate(start)} – ${fmtDate(addDays(start, days - 1))}`
}
function computeStartDates(legs: ItineraryLeg[], start: string): Map<string, Date> {
  const map = new Map<string, Date>()
  let cursor = new Date(start + 'T00:00:00')
  for (const leg of legs) { map.set(leg.id, new Date(cursor)); cursor = addDays(cursor, leg.duration_days) }
  return map
}
function fmtAud(n: number) {
  return n === 0 ? '—' : `$${Math.round(n).toLocaleString('en-AU')}`
}
function uid() { return crypto.randomUUID() }

// ── Constants ─────────────────────────────────────────────────────────────────

const MODE_STYLES: Record<ItineraryMode, { bg: string; text: string; icon: string }> = {
  Transit:    { bg: 'bg-gray-50',   text: 'text-gray-600',   icon: 'flight' },
  Experience: { bg: 'bg-sky-50',    text: 'text-sky-700',    icon: 'explore' },
  Maximise:   { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'landscape' },
  Reset:      { bg: 'bg-green-50',  text: 'text-green-700',  icon: 'self_care' },
}

const TIER_STYLES: Record<ActivityTier, { bg: string; text: string; dot: string }> = {
  must:     { bg: 'bg-sky-50',    text: 'text-sky-700',    dot: 'bg-sky-400' },
  nice:     { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  optional: { bg: 'bg-gray-100',  text: 'text-gray-500',   dot: 'bg-gray-300' },
}

const TIER_ORDER: Record<ActivityTier, number> = { must: 0, nice: 1, optional: 2 }

// ── Icon ──────────────────────────────────────────────────────────────────────

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} style={{ fontSize: 18 }}>{name}</span>
}

function ModeBadge({ mode }: { mode: ItineraryMode }) {
  const s = MODE_STYLES[mode]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <Icon name={s.icon} className={`${s.text} !text-sm`} />{mode}
    </span>
  )
}

function Avatar({ email }: { email: string }) {
  const colours = ['bg-violet-100 text-violet-700','bg-sky-100 text-sky-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700']
  const colour = colours[email.charCodeAt(0) % colours.length]
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${colour}`}>
      {email.slice(0, 2).toUpperCase()}
    </div>
  )
}

// ── Share Modal ───────────────────────────────────────────────────────────────

function ShareModal({ itinerary, userId, userEmail, onClose }: {
  itinerary: Itinerary; userId: string; userEmail: string; onClose: () => void
}) {
  const [email, setEmail]     = useState('')
  const [role, setRole]       = useState<'editor' | 'viewer'>('editor')
  const [members, setMembers] = useState<ItineraryMemberRow[]>([])
  const [pending, setPending] = useState<ItineraryInviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [m, p] = await Promise.all([
          getItineraryMembers(itinerary.id),
          getPendingItineraryInvites(itinerary.id),
        ])
        setMembers(m); setPending(p)
      } catch (e: any) { setError(e.message) }
      finally { setLoading(false) }
    }
    load()
  }, [itinerary.id])

  const handleInvite = async () => {
    if (!email.trim()) return setError('Please enter an email address.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Please enter a valid email.')
    if (email === userEmail) return setError("You can't invite yourself.")
    if (members.some(m => m.email === email)) return setError('This person already has access.')
    if (pending.some(p => p.invited_email === email)) return setError('Invite already sent.')
    setSending(true); setError('')
    try {
      await inviteToItinerary(itinerary.id, email.trim(), userId, role as ItineraryRole)
      setPending(prev => [...prev, { id: Date.now().toString(), itinerary_id: itinerary.id,
        invited_email: email.trim(), invited_by: userId, role: role as ItineraryRole, created_at: new Date().toISOString() }])
      setEmail('')
      setSuccess(`Invite recorded for ${email.trim()}`)
      setTimeout(() => setSuccess(''), 4000)
    } catch (e: any) { setError(e.message) }
    finally { setSending(false) }
  }

  const copyLink = async (inviteEmail: string) => {
    const link = `${window.location.origin}/invite?itinerary=${itinerary.id}`
    await navigator.clipboard.writeText(
      `You've been invited to collaborate on "${itinerary.title}" in Travel Planner.\n\nClick here to join: ${link}\n\nSign in with: ${inviteEmail}`
    )
    setCopiedId(inviteEmail); setTimeout(() => setCopiedId(null), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Share itinerary</h2>
            <p className="text-xs text-gray-400 mt-0.5">{itinerary.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon name="close" /></button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleInvite()} placeholder="Email address"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            <select value={role} onChange={e => setRole(e.target.value as 'editor' | 'viewer')}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400">
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button onClick={handleInvite} disabled={sending}
            className="w-full bg-sky-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <Icon name="person_add" className="text-white !text-base" />
            {sending ? 'Saving…' : 'Add invite'}
          </button>
          {error   && <p className="text-xs text-red-500">{error}</p>}
          {success && <p className="text-xs text-green-600">{success}</p>}
        </div>

        {!loading && (
          <div className="space-y-3">
            {members.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">People with access</div>
                <div className="space-y-2">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-3">
                      <Avatar email={m.email} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{m.email}</div>
                        <div className="text-xs text-gray-400 capitalize">{m.role}</div>
                      </div>
                      {m.user_id !== userId ? (
                        <button onClick={() => { removeItineraryMember(m.id); setMembers(prev => prev.filter(x => x.id !== m.id)) }}
                          className="text-gray-300 hover:text-red-400"><Icon name="close" /></button>
                      ) : <span className="text-xs text-gray-300">You</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
            {pending.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pending invites</div>
                <div className="space-y-2">
                  {pending.map(p => (
                    <div key={p.id} className="flex items-center gap-3">
                      <Avatar email={p.invited_email} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-500 truncate">{p.invited_email}</div>
                        <div className="text-xs text-gray-400">Pending · {p.role}</div>
                      </div>
                      <button onClick={() => copyLink(p.invited_email)}
                        className={`text-xs px-2 py-1 rounded-lg font-medium shrink-0 ${copiedId === p.invited_email ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {copiedId === p.invited_email ? '✓ Copied' : 'Copy link'}
                      </button>
                      <button onClick={() => { removeItineraryInvite(p.id); setPending(prev => prev.filter(x => x.id !== p.id)) }}
                        className="text-gray-300 hover:text-red-400"><Icon name="close" /></button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <p className="text-xs text-gray-400">Copy the invite link and send it to your collaborator. They'll need to sign in with the invited email.</p>
      </div>
    </div>
  )
}

// ── Itinerary management modal ────────────────────────────────────────────────

function ItineraryModal({ itineraries, activeId, onSelect, onCreate, onUpdate, onDelete, onClose }: {
  itineraries: ItineraryRow[]; activeId: string
  onSelect: (id: string) => void
  onCreate: (title: string, startDate: string, yearLabel: string) => void
  onUpdate: (id: string, title: string, startDate: string, yearLabel: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'list' | 'new' | 'edit'>('list')
  const [editTarget, setEditTarget] = useState<ItineraryRow | null>(null)
  const [title, setTitle] = useState(''); const [startDate, setStartDate] = useState(''); const [yearLabel, setYearLabel] = useState('')

  const openNew  = () => { setTitle('Round the World'); setStartDate(''); setYearLabel('Year 1'); setMode('new') }
  const openEdit = (itin: ItineraryRow) => { setEditTarget(itin); setTitle(itin.title); setStartDate(itin.start_date); setYearLabel(itin.year_label ?? ''); setMode('edit') }
  const handleSubmit = () => {
    if (!title.trim() || !startDate) return
    if (mode === 'new') onCreate(title.trim(), startDate, yearLabel.trim())
    else if (mode === 'edit' && editTarget) onUpdate(editTarget.id, title.trim(), startDate, yearLabel.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">{mode === 'list' ? 'Itineraries' : mode === 'new' ? 'New itinerary' : 'Edit itinerary'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon name="close" /></button>
        </div>
        {mode === 'list' ? (
          <div className="p-3 space-y-1">
            {itineraries.map(itin => (
              <div key={itin.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${itin.id === activeId ? 'bg-sky-50' : 'hover:bg-gray-50'}`}>
                <button className="flex-1 text-left" onClick={() => { onSelect(itin.id); onClose() }}>
                  <div className={`text-sm font-medium ${itin.id === activeId ? 'text-sky-700' : 'text-gray-900'}`}>{itin.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{itin.year_label && `${itin.year_label} · `}{itin.start_date ? `Starts ${new Date(itin.start_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</div>
                </button>
                <button onClick={() => openEdit(itin)} className="text-gray-300 hover:text-gray-500 p-1"><Icon name="edit" className="!text-base" /></button>
                {itineraries.length > 1 && (
                  <button onClick={() => { if (confirm('Delete this itinerary and all its legs?')) { onDelete(itin.id); onClose() } }} className="text-gray-300 hover:text-rose-400 p-1"><Icon name="delete" className="!text-base" /></button>
                )}
              </div>
            ))}
            <button onClick={openNew} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-sky-600 hover:bg-sky-50">
              <Icon name="add" className="!text-base" /> New itinerary
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="e.g. Round the World" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Start date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Year label</label>
                <input type="text" value={yearLabel} onChange={e => setYearLabel(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="e.g. Year 1" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setMode('list')} className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button onClick={handleSubmit} disabled={!title.trim() || !startDate}
                className="flex-1 px-3 py-2 bg-sky-600 text-white rounded-xl text-sm font-medium hover:bg-sky-700 disabled:opacity-40">
                {mode === 'new' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function TransitPanel({ detail, onChange }: { detail: TransitDetail; onChange: (d: TransitDetail) => void }) {
  const inp = (label: string, key: keyof TransitDetail, placeholder = '') => (
    <div key={key}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <input type="text" value={detail[key] as string} placeholder={placeholder}
        onChange={e => onChange({ ...detail, [key]: e.target.value })}
        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Transit details</div>
      <div className="grid grid-cols-3 gap-3">
        {inp('From', 'from_airport', 'PER')} {inp('To', 'to_airport', 'SCL')} {inp('Via (optional)', 'via_airport', 'SYD')}
        {inp('Airline', 'airline', 'LATAM')}
        <div>
          <div className="text-xs text-gray-400 mb-1">Fare type</div>
          <select value={detail.fare_type} onChange={e => onChange({ ...detail, fare_type: e.target.value as FareType })}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200">
            {(['Full fare', 'ID90', 'ZED', 'Staff standby'] as FareType[]).map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        {inp('Class', 'flight_class', 'Y / J / F')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-400 mb-1">Cost (AUD)</div>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input type="number" value={detail.cost_aud} onChange={e => onChange({ ...detail, cost_aud: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
          </div>
        </div>
        {inp('Booking notes', 'booking_notes')}
      </div>
    </div>
  )
}

function CostInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        <input type="number" min={0} value={value} onChange={e => onChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
      </div>
    </div>
  )
}

function ActivitiesPanel({ activities, onChange, onDelete }: {
  activities: Activity[]; onChange: (a: Activity[]) => void; onDelete: (id: string) => void
}) {
  const add = () => onChange([...activities, { id: uid(), sort_order: activities.length, description: '', tier: 'nice', category: '', cost_aud: '' }])
  const update = (id: string, patch: Partial<Activity>) => onChange(activities.map(a => a.id === id ? { ...a, ...patch } : a))
  const remove = (id: string) => { onDelete(id); onChange(activities.filter(a => a.id !== id)) }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Activities</div>
        <button onClick={add} className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-0.5"><Icon name="add" className="!text-sm" /> Add</button>
      </div>
      {activities.length === 0 && <p className="text-xs text-gray-400 italic">No activities yet.</p>}
      {activities.map(a => (
        <div key={a.id} className="space-y-1.5 p-2 bg-white border border-gray-100 rounded-xl">
          <div className="flex items-center gap-2">
            <input type="text" value={a.description} placeholder="Activity description"
              onChange={e => update(a.id, { description: e.target.value })}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
            <select value={a.tier} onChange={e => update(a.id, { tier: e.target.value as ActivityTier })}
              className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-200">
              <option value="must">Must</option><option value="nice">Nice</option><option value="optional">Optional</option>
            </select>
            <button onClick={() => remove(a.id)} className="text-gray-300 hover:text-rose-400"><Icon name="close" className="!text-base" /></button>
          </div>
          <div className="flex gap-2">
            <input type="text" value={a.category} placeholder="Category tag"
              onChange={e => update(a.id, { category: e.target.value })}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
            <div className="relative w-28 shrink-0">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
              <input type="number" min={0} value={a.cost_aud} placeholder="Cost"
                onChange={e => update(a.id, { cost_aud: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg pl-5 pr-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AccomPanel({ accom, duration, onChange, onDelete }: {
  accom: AccomNote[]; duration: number; onChange: (a: AccomNote[]) => void; onDelete: (id: string) => void
}) {
  const add = () => onChange([...accom, { id: uid(), sort_order: accom.length, accom_type: 'TBD', name: '', notes: '', booking_status: 'unplanned', cost_per_night_aud: '' }])
  const update = (id: string, patch: Partial<AccomNote>) => onChange(accom.map(a => a.id === id ? { ...a, ...patch } : a))
  const remove = (id: string) => { onDelete(id); onChange(accom.filter(a => a.id !== id)) }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Accommodation</div>
        <button onClick={add} className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-0.5"><Icon name="add" className="!text-sm" /> Add</button>
      </div>
      {accom.length === 0 && <p className="text-xs text-gray-400 italic">No accommodation noted yet.</p>}
      {accom.map(a => {
        const nightlyCost = Number(a.cost_per_night_aud) || 0
        const totalCost = nightlyCost * duration
        return (
          <div key={a.id} className="space-y-2 border border-gray-100 rounded-xl p-3 bg-white">
            <div className="flex items-center gap-2 flex-wrap">
              <select value={a.accom_type} onChange={e => update(a.id, { accom_type: e.target.value as AccomType })}
                className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-200">
                {(['Boutique','Budget','Apartment','Camping','Hostel','Resort','TBD'] as AccomType[]).map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="text" value={a.name} placeholder="Property name (optional)"
                onChange={e => update(a.id, { name: e.target.value })}
                className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
              <select value={a.booking_status} onChange={e => update(a.id, { booking_status: e.target.value as BookingStatus })}
                className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-200">
                <option value="unplanned">Unplanned</option><option value="researching">Researching</option>
                <option value="noted">Noted</option><option value="booked">Booked</option>
              </select>
              <button onClick={() => remove(a.id)} className="text-gray-300 hover:text-rose-400 shrink-0"><Icon name="close" className="!text-base" /></button>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative w-36 shrink-0">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$/night</span>
                <input type="number" min={0} value={a.cost_per_night_aud} placeholder="0"
                  onChange={e => update(a.id, { cost_per_night_aud: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg pl-14 pr-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
              </div>
              {totalCost > 0 && (
                <span className="text-xs text-gray-400">= {fmtAud(totalCost)} for {duration} nights</span>
              )}
            </div>
            <input type="text" value={a.notes} placeholder="Notes (veggie options, booking refs, tips…)"
              onChange={e => update(a.id, { notes: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
          </div>
        )
      })}
    </div>
  )
}

// ── LegRow (sortable) ─────────────────────────────────────────────────────────

function LegRow({ leg, startDate, expanded, saving, onSave, onToggle, onDelete, onDeleteActivity, onDeleteAccom }: {
  leg: ItineraryLeg; startDate: Date; expanded: boolean; saving: boolean
  onSave: (l: ItineraryLeg) => void; onToggle: () => void; onDelete: () => void
  onDeleteActivity: (id: string) => void; onDeleteAccom: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: leg.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 50 : undefined }

  const [draft, setDraft] = useState<ItineraryLeg>(leg)
  useEffect(() => { if (!expanded) setDraft(leg) }, [leg.id, expanded])

  const isTransit = draft.mode === 'Transit'
  const sorted = [...leg.activities].sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9))
  const costDisplay = isTransit && draft.transit?.cost_aud ? `$${Number(draft.transit.cost_aud).toLocaleString('en-AU')}` : null

  const emptyTransit: Omit<TransitDetail, 'id'> = {
    from_airport: '', to_airport: '', via_airport: '', airline: '',
    fare_type: 'Full fare', flight_class: '', cost_aud: '', booking_notes: '',
  }

  const handleSave = () => { onSave(draft); onToggle() }

  return (
    <div ref={setNodeRef} style={style} className={`border rounded-xl overflow-hidden bg-white transition-shadow ${isDragging ? 'shadow-lg border-sky-200' : expanded ? 'border-sky-200 shadow-sm' : 'border-gray-100'}`}>

      {/* Summary row */}
      <div className="flex items-start gap-2 px-3 py-3">
        {/* Drag handle */}
        <button ref={setActivatorNodeRef} {...attributes} {...listeners}
          className="shrink-0 mt-1 text-gray-200 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none" tabIndex={-1}>
          <Icon name="drag_indicator" className="!text-base" />
        </button>

        {/* Mode badge */}
        <div className="hidden sm:block w-24 shrink-0 pt-0.5"><ModeBadge mode={leg.mode} /></div>

        {/* Destination + date */}
        <div className="w-40 shrink-0 min-w-0">
          <div className="font-medium text-gray-900 text-sm truncate">{leg.destination}</div>
          <div className="text-xs text-gray-400 mt-0.5">{fmtDateRange(startDate, leg.duration_days)}</div>
          {leg.notes && <div className="text-xs text-gray-400 mt-1 line-clamp-1">{leg.notes}</div>}
          {isTransit && leg.transit?.from_airport && leg.transit?.to_airport && (
            <div className="text-xs text-gray-400 mt-0.5">
              {leg.transit.from_airport} → {leg.transit.to_airport}
              {leg.transit.airline && ` · ${leg.transit.airline}`}
              {leg.transit.fare_type && leg.transit.fare_type !== 'Full fare' && <span className="ml-1 text-amber-600 font-medium"> {leg.transit.fare_type}</span>}
            </div>
          )}
        </div>

        {/* Activities — middle column */}
        <div className="flex-1 min-w-0 self-center">
          {sorted.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {sorted.slice(0, 6).map(a => {
                const s = TIER_STYLES[a.tier] ?? TIER_STYLES.optional
                return (
                  <span key={a.id} className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${s.bg} ${s.text}`}>
                    <span className={`w-1 h-1 rounded-full shrink-0 ${s.dot}`} />{a.description}
                  </span>
                )
              })}
              {sorted.length > 6 && <span className="text-xs text-gray-400 self-center">+{sorted.length - 6}</span>}
            </div>
          ) : (
            <span className="text-xs text-gray-300 italic">No activities yet</span>
          )}
        </div>

        {/* Duration + cost */}
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium text-gray-700">{leg.duration_days}d</div>
          {costDisplay && <div className="text-xs text-gray-400 mt-0.5">{costDisplay}</div>}
        </div>

        {saving && <div className="shrink-0 pt-0.5"><Icon name="sync" className="text-sky-400 !text-base animate-spin" /></div>}

        <button onClick={expanded ? handleSave : onToggle}
          className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${expanded ? 'bg-sky-600 text-white hover:bg-sky-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
          <Icon name={expanded ? 'check' : 'edit'} className="!text-sm" />
          <span className="hidden sm:inline">{expanded ? 'Save' : 'Edit'}</span>
        </button>
      </div>

      {/* Detail panel */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-gray-400 mb-1">Mode</div>
              <select value={draft.mode} onChange={e => {
                const mode = e.target.value as ItineraryMode
                setDraft(d => ({ ...d, mode, transit: mode === 'Transit' ? (d.transit ?? { id: uid(), ...emptyTransit }) : d.transit }))
              }} className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200">
                {(['Transit','Experience','Maximise','Reset'] as ItineraryMode[]).map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Destination</div>
              <input type="text" value={draft.destination} onChange={e => setDraft(d => ({ ...d, destination: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Region</div>
              <input type="text" value={draft.region} onChange={e => setDraft(d => ({ ...d, region: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Duration (days)</div>
              <input type="number" min={1} value={draft.duration_days}
                onChange={e => setDraft(d => ({ ...d, duration_days: Math.max(1, Number(e.target.value)) }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
            </div>
          </div>

          {/* Daily budget */}
          <CostInput
            label="Daily living budget (AUD/day) — food, local transport, incidentals"
            value={draft.daily_budget_aud}
            onChange={v => setDraft(d => ({ ...d, daily_budget_aud: v }))}
          />

          <div>
            <div className="text-xs text-gray-400 mb-1">Notes</div>
            <textarea value={draft.notes} rows={2} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              placeholder="General notes, reminders, visa requirements…"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-200 resize-none" />
          </div>

          {draft.mode === 'Transit' && (
            <TransitPanel detail={draft.transit ?? { id: '', ...emptyTransit }} onChange={transit => setDraft(d => ({ ...d, transit }))} />
          )}

          <div className="grid sm:grid-cols-2 gap-5">
            <ActivitiesPanel activities={draft.activities} onChange={activities => setDraft(d => ({ ...d, activities }))} onDelete={onDeleteActivity} />
            <AccomPanel accom={draft.accom} duration={draft.duration_days} onChange={accom => setDraft(d => ({ ...d, accom }))} onDelete={onDeleteAccom} />
          </div>

          <div className="flex items-center justify-between pt-1">
            <button onClick={onDelete} className="text-xs text-gray-400 hover:text-rose-500 flex items-center gap-1">
              <Icon name="delete" className="!text-sm" /> Remove leg
            </button>
            <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-xl text-xs font-medium hover:bg-sky-700">
              <Icon name="check" className="!text-sm text-white" /> Save & close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stats bars ────────────────────────────────────────────────────────────────

function StatsRow({ legs }: { legs: ItineraryLeg[] }) {
  const dests   = legs.filter(l => l.mode !== 'Transit').length
  const regions = new Set(legs.map(l => l.region)).size
  const totalDays = legs.reduce((s, l) => s + l.duration_days, 0)
  const budget  = computeBudget(legs)

  const journeyStat = (label: string, value: string) => (
    <div key={label} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex-1 min-w-0">
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  )

  const budgetStat = (label: string, value: number, accent = false) => (
    <div key={label} className={`border rounded-xl px-4 py-3 flex-1 min-w-0 ${accent ? 'bg-sky-600 border-sky-600' : 'bg-white border-gray-100'}`}>
      <div className={`text-lg font-semibold ${accent ? 'text-white' : 'text-gray-900'}`}>{fmtAud(value)}</div>
      <div className={`text-xs mt-0.5 ${accent ? 'text-sky-100' : 'text-gray-400'}`}>{label}</div>
    </div>
  )

  return (
    <div className="space-y-2">
      {/* Row 1: journey overview */}
      <div className="flex gap-2 flex-wrap">
        {journeyStat('Regions', String(regions))}
        {journeyStat('Destinations', String(dests))}
        {journeyStat('Days', String(totalDays))}
        {journeyStat('Avg daily budget', fmtAud(budget.avgDailyBudget))}
      </div>
      {/* Row 2: budget breakdown */}
      <div className="flex gap-2 flex-wrap">
        {budgetStat('Transit', budget.transitTotal)}
        {budgetStat('Accommodation', budget.accomTotal)}
        {budgetStat('Activities', budget.activitiesTotal)}
        {budgetStat('Living costs', budget.livingTotal)}
        {budgetStat('Total estimate', budget.grandTotal, true)}
      </div>
    </div>
  )
}

function RegionHeader({ label, legs, startDates }: { label: string; legs: ItineraryLeg[]; startDates: Map<string, Date> }) {
  const first = startDates.get(legs[0].id)
  const last  = startDates.get(legs[legs.length - 1].id)
  const totalDays = legs.reduce((s, l) => s + l.duration_days, 0)
  const endDate = last ? addDays(last, legs[legs.length - 1].duration_days - 1) : null
  return (
    <div className="flex items-center gap-3 pt-3 pb-1">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest whitespace-nowrap">{label}</span>
      {first && endDate && <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(first)} – {fmtDate(endDate)} · {totalDays}d</span>}
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

function DateSpine({ date, prevDate }: { date: Date; prevDate: Date | null }) {
  const showMonth = !prevDate || prevDate.getMonth() !== date.getMonth()
  return (
    <div className="flex flex-col items-center w-9 shrink-0 pt-3 select-none">
      {showMonth && <span className="text-xs font-semibold text-gray-400 uppercase leading-none mb-1">{date.toLocaleDateString('en-AU', { month: 'short' })}</span>}
      <span className="text-sm font-semibold text-gray-300 leading-none">{date.getDate()}</span>
      <div className="flex-1 w-px bg-gray-100 mt-2 min-h-4" />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ItineraryPage() {
  const [allItineraries, setAllItineraries] = useState<ItineraryRow[]>([])
  const [itinerary, setItinerary]   = useState<Itinerary | null>(null)
  const [legs, setLegs]             = useState<ItineraryLeg[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingIds, setSavingIds]   = useState<Set<string>>(new Set())
  const [filterRegion, setFilterRegion] = useState('All')
  const [showItinModal, setShowItinModal]   = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // ── Load ─────────────────────────────────────────────────────────────────

  // ── PATCH: replace loadItinerary in app/itinerary/page.tsx ───────────────────
// Find the existing loadItinerary useCallback and replace the entire function
// body with this. The key change is fetching all itineraries the user is a
// MEMBER of (not just ones they created), then merging and deduplicating.

  const loadItinerary = useCallback(async (itinId?: string) => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUser({ id: user.id, email: user.email ?? '' })

      // Fetch itineraries the user CREATED
      const { data: ownedRows, error: ownedErr } = await supabase
        .from('itineraries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (ownedErr) throw ownedErr

      // Fetch itineraries the user is a MEMBER of (shared with them)
      const { data: memberRows, error: memberErr } = await supabase
        .from('itinerary_members')
        .select('itinerary_id, itineraries(*)')
        .eq('user_id', user.id)
      if (memberErr) throw memberErr

      // Merge and deduplicate by id
      const memberItins = (memberRows ?? [])
        .map((r: any) => r.itineraries)
        .filter(Boolean)

      const allMap = new Map<string, any>()
      for (const row of [...(ownedRows ?? []), ...memberItins]) {
        if (row && !allMap.has(row.id)) allMap.set(row.id, row)
      }
      const allRows = Array.from(allMap.values())
        .sort((a, b) => a.created_at.localeCompare(b.created_at))

      setAllItineraries(allRows)

      let targetId = itinId ?? allRows[0]?.id

      // First-ever use — create a default itinerary
      if (!targetId) {
        const { data: newRow, error: createErr } = await supabase
          .from('itineraries')
          .insert({ user_id: user.id, title: 'Round the World', start_date: '2026-01-16', year_label: 'Year 1' })
          .select()
          .single()
        if (createErr) throw createErr
        setAllItineraries([newRow])
        targetId = newRow.id
      }

      const itin = await fetchItinerary(user.id, targetId)
      if (itin) {
        setItinerary(itin)
        setLegs(itin.legs)
        setFilterRegion('All')
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadItinerary() }, [loadItinerary])

  // ── Itinerary CRUD ────────────────────────────────────────────────────────

  const handleCreateItinerary = async (title: string, startDate: string, yearLabel: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('itineraries')
      .insert({ user_id: user.id, title, start_date: startDate, year_label: yearLabel }).select().single()
    if (error) { setError(error.message); return }
    await loadItinerary(data.id)
  }

  const handleUpdateItinerary = async (id: string, title: string, startDate: string, yearLabel: string) => {
    await updateItinerary(id, { title, start_date: startDate, year_label: yearLabel })
    await loadItinerary(id)
  }

  const handleDeleteItinerary = async (id: string) => {
    await supabase.from('itineraries').delete().eq('id', id); await loadItinerary()
  }

  // ── Save leg ──────────────────────────────────────────────────────────────

  const handleSaveLeg = useCallback(async (updated: ItineraryLeg) => {
    setLegs(prev => prev.map(l => l.id === updated.id ? updated : l))
    setSavingIds(s => new Set(s).add(updated.id))
    try { await saveLeg(updated) }
    catch (e: any) { setError(e.message) }
    finally { setSavingIds(s => { const n = new Set(s); n.delete(updated.id); return n }) }
  }, [])

  // ── Add leg ───────────────────────────────────────────────────────────────

  const handleAddLeg = async () => {
    if (!itinerary) return
    const { data: row, error } = await supabase.from('itinerary_legs').insert({
      itinerary_id: itinerary.id, sort_order: legs.length,
      region: legs[legs.length - 1]?.region ?? 'New Region',
      mode: 'Experience', destination: 'New destination', duration_days: 7,
    }).select().single()
    if (error) { setError(error.message); return }
    const newLeg: ItineraryLeg = {
      id: row.id, itinerary_id: row.itinerary_id, sort_order: row.sort_order,
      region: row.region, mode: row.mode, destination: row.destination,
      duration_days: row.duration_days, daily_budget_aud: '', notes: '',
      transit: null, activities: [], accom: [],
    }
    setLegs(prev => [...prev, newLeg]); setExpandedId(row.id)
  }

  // ── Delete leg ────────────────────────────────────────────────────────────

  const handleDeleteLeg = async (id: string) => {
    setLegs(prev => prev.filter(l => l.id !== id))
    if (expandedId === id) setExpandedId(null)
    try { await dbDeleteLeg(id) } catch (e: any) { setError(e.message) }
  }

  // ── Drag end ──────────────────────────────────────────────────────────────

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLegs(prev => {
      const oldIndex = prev.findIndex(l => l.id === active.id)
      const newIndex = prev.findIndex(l => l.id === over.id)
      const reordered = arrayMove(prev, oldIndex, newIndex).map((l, i) => ({ ...l, sort_order: i }))
      // Individual UPDATEs — satisfies RLS (no insert needed)
      Promise.all(reordered.map(l => supabase.from('itinerary_legs').update({ sort_order: l.sort_order }).eq('id', l.id)))
        .catch(e => setError(e.message))
      return reordered
    })
  }, [])

  const handleDeleteActivity = async (id: string) => { try { await dbDeleteActivity(id) } catch {} }
  const handleDeleteAccom    = async (id: string) => { try { await dbDeleteAccomNote(id) } catch {} }

  // ── Derived ───────────────────────────────────────────────────────────────

  const startDates = useMemo(
    () => computeStartDates(legs, itinerary?.start_date ?? '2026-01-16'),
    [legs, itinerary?.start_date]
  )

  const regions = useMemo(() => ['All', ...Array.from(new Set(legs.map(l => l.region)))], [legs])

  const visibleLegs = filterRegion === 'All' ? legs : legs.filter(l => l.region === filterRegion)

  const grouped = useMemo(() => {
    const result: { region: string; legs: ItineraryLeg[] }[] = []
    for (const leg of visibleLegs) {
      const last = result[result.length - 1]
      if (last && last.region === leg.region) last.legs.push(leg)
      else result.push({ region: leg.region, legs: [leg] })
    }
    return result
  }, [visibleLegs])

  // ── Render ────────────────────────────────────────────────────────────────

  const content = () => {
    if (loading) return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Icon name="sync" className="text-gray-300 animate-spin" />
          <span className="text-sm">Loading itinerary…</span>
        </div>
      </div>
    )
    if (error) return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center space-y-2">
          <Icon name="error" className="text-rose-400" />
          <p className="text-sm text-gray-600">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-sky-600 hover:underline">Dismiss</button>
        </div>
      </div>
    )

    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">

          {/* Header — prominent itinerary name with clear action affordance */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-gray-900">Itinerary</h1>
              {/* Itinerary selector — styled as a pill button so it reads as interactive */}
              <button
                onClick={() => setShowItinModal(true)}
                className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-sky-50 border border-gray-200 hover:border-sky-200 rounded-full transition-colors group"
              >
                <Icon name="map" className="text-gray-400 group-hover:text-sky-500 !text-sm" />
                <span className="text-sm font-medium text-gray-700 group-hover:text-sky-700 truncate max-w-[200px]">
                  {itinerary?.title ?? '—'}
                </span>
                {itinerary?.year_label && (
                  <span className="text-xs text-gray-400 group-hover:text-sky-500">{itinerary.year_label}</span>
                )}
                <Icon name="expand_more" className="text-gray-400 group-hover:text-sky-500 !text-sm shrink-0" />
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Share button */}
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Icon name="group_add" className="text-gray-400" />
                <span className="hidden sm:inline">Share</span>
              </button>
              <button onClick={handleAddLeg}
                className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 text-white text-sm font-medium rounded-xl hover:bg-sky-700 transition-colors">
                <Icon name="add" className="text-white" /> Add leg
              </button>
            </div>
          </div>

          {/* Two-row stats */}
          <StatsRow legs={legs} />

          {/* Region filter */}
          <div className="flex gap-2 flex-wrap">
            {regions.map(r => (
              <button key={r} onClick={() => setFilterRegion(r)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterRegion === r ? 'bg-sky-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {r}
              </button>
            ))}
          </div>

          {legs.length === 0 && (
            <div className="text-center py-16 text-gray-400 space-y-2">
              <Icon name="map" className="text-gray-200 !text-5xl" />
              <p className="text-sm">No legs yet — add your first one to get started.</p>
            </div>
          )}

          {/* DnD list */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={legs.map(l => l.id)} strategy={verticalListSortingStrategy}>
              {grouped.map((group, groupIdx) => (
	        <div key={`${group.region}-${groupIdx}`}>
                  <RegionHeader label={group.region} legs={group.legs} startDates={startDates} />
                  <div className="space-y-2">
                    {group.legs.map(leg => {
                      const date = startDates.get(leg.id)!
                      const allVisIdx = visibleLegs.findIndex(l => l.id === leg.id)
                      const prevDate = allVisIdx > 0 ? startDates.get(visibleLegs[allVisIdx - 1].id) ?? null : null
                      return (
                        <div key={leg.id} className="flex items-stretch gap-0">
                          <DateSpine date={date} prevDate={prevDate} />
                          <div className="flex-1 min-w-0 pb-2">
                            <LegRow
                              leg={leg} startDate={date}
                              expanded={expandedId === leg.id} saving={savingIds.has(leg.id)}
                              onSave={handleSaveLeg}
                              onToggle={() => setExpandedId(prev => prev === leg.id ? null : leg.id)}
                              onDelete={() => handleDeleteLeg(leg.id)}
                              onDeleteActivity={handleDeleteActivity}
                              onDeleteAccom={handleDeleteAccom}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </SortableContext>
          </DndContext>

          <button onClick={handleAddLeg}
            className="w-full py-3 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-sky-300 hover:text-sky-500 transition-colors flex items-center justify-center gap-1.5">
            <Icon name="add" className="!text-base" /> Add leg
          </button>

          <p className="text-xs text-gray-400 text-center pb-4">
            Drag to reorder · Edit to modify · Save to confirm · Dates and budget totals cascade automatically
          </p>
        </div>

        {/* Modals */}
        {showItinModal && (
          <ItineraryModal
            itineraries={allItineraries} activeId={itinerary?.id ?? ''}
            onSelect={id => loadItinerary(id)}
            onCreate={handleCreateItinerary} onUpdate={handleUpdateItinerary}
            onDelete={handleDeleteItinerary} onClose={() => setShowItinModal(false)}
          />
        )}
        {showShareModal && itinerary && currentUser && (
          <ShareModal
            itinerary={itinerary} userId={currentUser.id} userEmail={currentUser.email}
            onClose={() => setShowShareModal(false)}
          />
        )}
      </div>
    )
  }

  return <AppShell>{content()}</AppShell>
}