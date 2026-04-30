'use client'

import { useState, useEffect } from 'react'
import { inviteToTrip, getTripMembers, getPendingInvites, removeInvite, removeMember } from '@/lib/trips'
import type { Trip } from '@/lib/types'

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} style={{ fontSize: 20 }}>{name}</span>
}

function Avatar({ email, size = 8 }: { email: string; size?: number }) {
  const initials = email.slice(0, 2).toUpperCase()
  const colours = [
    'bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700',
    'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
  ]
  const colour = colours[email.charCodeAt(0) % colours.length]
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-xs font-semibold ${colour} shrink-0`}>
      {initials}
    </div>
  )
}

export default function ShareModal({ trip, userId, userEmail, onClose }: {
  trip: Trip; userId: string; userEmail: string; onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [members, setMembers] = useState<{ id: string; user_id: string; role: string; email: string }[]>([])
  const [pending, setPending] = useState<{ id: string; invited_email: string; role: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const load = async () => {
      const [m, p] = await Promise.all([
        getTripMembers(trip.id),
        getPendingInvites(trip.id),
      ])
      setMembers(m)
      setPending(p)
      setLoading(false)
    }
    load()
  }, [trip.id])

  const handleInvite = async () => {
    if (!email.trim()) return setError('Please enter an email address.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Please enter a valid email.')
    if (email === userEmail) return setError('You can\'t invite yourself.')
    if (members.some((m) => m.email === email)) return setError('This person already has access.')
    if (pending.some((p) => p.invited_email === email)) return setError('Invite already sent to this email.')

    setSending(true)
    setError('')
    try {
      await inviteToTrip(trip.id, email.trim(), userId, userEmail, trip.name, role)
      setPending((prev) => [...prev, { id: Date.now().toString(), invited_email: email.trim(), role }])
      setEmail('')
      setSuccess(`Invite sent to ${email.trim()}`)
      setTimeout(() => setSuccess(''), 4000)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
    } finally {
      setSending(false)
    }
  }

  const handleRemoveInvite = async (id: string) => {
    await removeInvite(id)
    setPending((prev) => prev.filter((p) => p.id !== id))
  }

  const handleRemoveMember = async (id: string, membUserId: string) => {
    if (membUserId === userId) return setError("You can't remove yourself.")
    await removeMember(id)
    setMembers((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Share trip</h2>
            <p className="text-xs text-gray-400 mt-0.5">{trip.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Invite form */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              placeholder="Email address"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button
            onClick={handleInvite}
            disabled={sending}
            className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Icon name="send" className="text-white !text-base" />
            {sending ? 'Sending invite…' : 'Send invite'}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {success && <p className="text-xs text-green-600 flex items-center gap-1"><Icon name="check_circle" className="text-green-500 !text-base" />{success}</p>}
        </div>

        {/* Members */}
        {!loading && (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              People with access
            </div>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar email={m.email} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{m.email}</div>
                    <div className="text-xs text-gray-400 capitalize">{m.role}</div>
                  </div>
                  {m.user_id !== userId && (
                    <button
                      onClick={() => handleRemoveMember(m.id, m.user_id)}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <Icon name="close" />
                    </button>
                  )}
                  {m.user_id === userId && (
                    <span className="text-xs text-gray-300">You</span>
                  )}
                </div>
              ))}
            </div>

            {pending.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Pending invites
                </div>
                <div className="space-y-2">
                  {pending.map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <Avatar email={p.invited_email} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-500 truncate">{p.invited_email}</div>
                        <div className="text-xs text-gray-400">Invite sent · {p.role}</div>
                      </div>
                      <button
                        onClick={() => handleRemoveInvite(p.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400">
          Editors can add and edit items. Viewers can only view the trip.
        </p>
      </div>
    </div>
  )
}