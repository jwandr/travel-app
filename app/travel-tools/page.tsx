'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getTravelTools, addTravelTool, updateTravelTool, deleteTravelTool } from '@/lib/trips'
import AppShell from '@/components/AppShell'
import type { TravelTool } from '@/lib/types'

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} style={{ fontSize: 20 }}>{name}</span>
}

function ToolModal({
  tool, userId, onSaved, onClose,
}: {
  tool?: TravelTool; userId: string; onSaved: (t: TravelTool) => void; onClose: () => void
}) {
  const [title, setTitle] = useState(tool?.title ?? '')
  const [url, setUrl] = useState(tool?.url ?? '')
  const [description, setDescription] = useState(tool?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!title.trim()) return setError('Title is required.')
    if (!url.trim()) return setError('URL is required.')
    setSaving(true)
    try {
      let fullUrl = url.trim()
      if (!/^https?:\/\//i.test(fullUrl)) fullUrl = `https://${fullUrl}`
      const saved = tool
        ? await updateTravelTool(tool.id, { title: title.trim(), url: fullUrl, description })
        : await addTravelTool(userId, { title: title.trim(), url: fullUrl, description })
      onSaved(saved)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{tool ? 'Edit Tool' : 'Add Tool'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              placeholder="e.g. Google Flights"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. flights.google.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} placeholder="What is this tool for?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TravelToolsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tools, setTools] = useState<TravelTool[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; tool?: TravelTool }>({ open: false })

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      setUser(data.user)
      const t = await getTravelTools(data.user.id)
      setTools(t)
      setLoading(false)
    }
    load()
  }, [router])

  const handleSaved = (tool: TravelTool) => {
    setTools((prev) => {
      const exists = prev.find((t) => t.id === tool.id)
      return exists ? prev.map((t) => t.id === tool.id ? tool : t) : [...prev, tool]
    })
    setModal({ open: false })
  }

  const handleDelete = async (id: string) => {
    await deleteTravelTool(id)
    setTools((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Travel Tools</h1>
              <p className="text-sm text-gray-400 mt-0.5">Your favourite planning resources</p>
            </div>
            <button onClick={() => setModal({ open: true })}
              className="bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
              <Icon name="add" className="text-white" /> Add Tool
            </button>
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
          ) : tools.length === 0 ? (
            <div className="text-center py-24 text-gray-400">
              <Icon name="build" className="text-gray-200 !text-5xl block mx-auto mb-3" />
              <p className="text-sm">No tools yet. Add your first one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tools.map((tool) => (
                <div key={tool.id}
                  className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow group">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                    <Icon name="link" className="text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{tool.title}</div>
                    {tool.description && (
                      <div className="text-xs text-gray-400 mt-0.5 truncate">{tool.description}</div>
                    )}
                    <div className="text-xs text-indigo-400 mt-0.5 truncate">{tool.url}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setModal({ open: true, tool })}
                      className="p-2 text-gray-300 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50">
                      <Icon name="edit" />
                    </button>
                    <button onClick={() => window.open(tool.url, '_blank')}
                      className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                      <Icon name="open_in_new" className="text-white" />
                    </button>
                    <button onClick={() => handleDelete(tool.id)}
                      className="p-2 text-gray-300 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-50 opacity-0 group-hover:opacity-100">
                      <Icon name="delete" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modal.open && user && (
        <ToolModal
          tool={modal.tool}
          userId={user.id}
          onSaved={handleSaved}
          onClose={() => setModal({ open: false })}
        />
      )}
    </AppShell>
  )
}