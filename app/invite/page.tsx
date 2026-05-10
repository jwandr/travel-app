'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function InvitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tripId = searchParams.get('trip')

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Already signed in — accept invites and go to trip
        await supabase.rpc('accept_pending_invites')
        router.push(tripId ? `/trip/${tripId}` : '/dashboard')
      } else {
        // Not signed in — go to login, then come back here
        router.push(`/login?next=/invite${tripId ? `?trip=${tripId}` : ''}`)
      }
    }
    check()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm animate-pulse">Setting up your access…</div>
    </div>
  )
}