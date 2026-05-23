'use client'

import { useState, useEffect } from 'react'
import { getProfile, upsertProfile } from '@/lib/trips'

interface ProfileSettingsProps {
  userId: string
  onClose: () => void
}

export default function ProfileSettings({ userId, onClose }: ProfileSettingsProps) {
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getProfile(userId).then((p) => {
      if (p) {
        setDisplayName(p.display_name ?? '')
        setAvatarUrl(p.avatar_url ?? '')
      }
    })
  }, [userId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await upsertProfile(userId, {
        display_name: displayName.trim() || undefined,
        avatar_url: avatarUrl.trim() || undefined,
      })
      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 1000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pt-2 border-t border-gray-100">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Your profile</div>

      <div className="flex items-center gap-3">
        {/* Avatar preview */}
        <div className="w-12 h-12 rounded-full overflow-hidden bg-sky-100 flex items-center justify-center text-sky-700 font-semibold shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <span>{displayName ? displayName.slice(0, 2).toUpperCase() : '?'}</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <input
            type="text"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="Avatar image URL (optional)"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-sky-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors"
      >
        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save profile'}
      </button>
    </div>
  )
}