'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.push('/dashboard')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) router.push('/dashboard')
    })

    return () => listener.subscription.unsubscribe()
  }, [router])

  const signIn = async () => {
    if (loading || !email.trim()) return
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8 space-y-6">
        {/* Logo / Title */}
        <div className="text-center space-y-1">
          <div className="text-4xl">✈️</div>
          <h1 className="text-xl font-semibold text-gray-900">Travel Planner</h1>
          <p className="text-sm text-gray-400">Sign in to plan your trips</p>
        </div>

        {sent ? (
          <div className="text-center space-y-3">
            <div className="text-3xl">✉️</div>
            <p className="text-sm font-medium text-gray-700">Check your inbox</p>
            <p className="text-xs text-gray-400">
              We sent a magic link to <span className="font-medium text-gray-600">{email}</span>.
              Click it to sign in.
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && signIn()}
                placeholder="you@example.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            <button
              onClick={signIn}
              disabled={loading || !email.trim()}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>

            <p className="text-xs text-center text-gray-400">
              No password needed — we'll email you a sign-in link.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}