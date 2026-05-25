'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function InviteHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tripId       = searchParams.get('trip')
  const itineraryId  = searchParams.get('itinerary')

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Consume all pending invites (trips + itineraries) for this email
        await supabase.rpc('accept_pending_invites')

        // Redirect to the right place
        if (itineraryId) {
          router.push('/itinerary')
        } else if (tripId) {
          router.push(`/trip/${tripId}`)
        } else {
          router.push('/dashboard')
        }
      } else {
        // Not logged in — send to login, preserving the full invite URL as next
        const next = itineraryId
          ? `/invite?itinerary=${itineraryId}`
          : tripId
            ? `/invite?trip=${tripId}`
            : '/invite'
        router.push(`/login?next=${encodeURIComponent(next)}`)
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