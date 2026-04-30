'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getTrip } from '@/lib/trips'
import TripView from '@/components/TripView'
import type { Trip, Day } from '@/lib/types'

export default function TripPageClient({ tripId }: { tripId: string }) {
  const router = useRouter()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<Day[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: tripData, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single()

      if (error || !tripData) { router.push('/dashboard'); return }

      const days = await getTrip(tripId)
      setTrip(tripData)
      setDays(days)
      setLoading(false)
    }
    load()
  }, [tripId, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-300 text-sm animate-pulse">Loading trip…</div>
      </div>
    )
  }

  if (!trip || !userId) return null

  return <TripView trip={trip} days={days} userId={userId} />
}