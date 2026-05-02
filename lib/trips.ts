import { supabase } from './supabase'
import type { Trip, Day, Item, Accommodation, TravelTool } from './types'

// ─── Trips ────────────────────────────────────────────────────────────────────

export async function createTrip(input: {
  name: string
  start_date: string
  duration_days: number
  userId: string
}): Promise<Trip> {
  const { name, start_date, duration_days, userId } = input

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert({ name, start_date, duration_days, created_by: userId })
    .select()
    .single()
  if (tripError) throw tripError

  const { error: memberError } = await supabase
    .from('trip_members')
    .insert({ trip_id: trip.id, user_id: userId, role: 'owner' })
  if (memberError) throw memberError

  await generateDays(trip.id, start_date, duration_days)
  return trip
}

export async function updateTrip(
  tripId: string,
  updates: { name?: string; start_date?: string; duration_days?: number }
): Promise<Trip> {
  const { data: trip, error } = await supabase
    .from('trips')
    .update(updates)
    .eq('id', tripId)
    .select()
    .single()
  if (error) throw error

  if (updates.start_date || updates.duration_days) {
    await regenerateDays(tripId)
  }
  return trip
}

export async function deleteTrip(tripId: string): Promise<void> {
  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  if (error) throw error
}

export async function getTrip(tripId: string): Promise<Day[]> {
  const { data, error } = await supabase
    .from('days')
    .select('*, items(*)')
    .eq('trip_id', tripId)
    .order('day_index')
  if (error) throw error

  return (data ?? []).map((day) => ({
    ...day,
    items: (day.items ?? []).sort((a: Item, b: Item) => {
      if (!a.start_time && !b.start_time) return a.sort_order - b.sort_order
      if (!a.start_time) return 1
      if (!b.start_time) return -1
      return a.start_time.localeCompare(b.start_time)
    }),
  }))
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function addItem(
  dayId: string,
  tripId: string,
  type: Item['type'] = 'activity'
): Promise<Item> {
  const { data: existing } = await supabase
    .from('items')
    .select('sort_order')
    .eq('day_id', dayId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

  const { data, error } = await supabase
    .from('items')
    .insert({
      trip_id: tripId,
      day_id: dayId,
      type,
      title: '',
      start_time: '09:00',
      end_time: '10:00',
      duration_minutes: 60,
      sort_order: nextOrder,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateItem(
  itemId: string,
  updates: Partial<Pick<Item,
    'title' | 'type' | 'notes' | 'start_time' | 'end_time' |
    'sort_order' | 'subtitle' | 'confirmation' | 'confirmed' |
    'image_url' | 'day_id' | 'duration_minutes' | 'time_locked'>>
): Promise<Item> {
  const cleaned: typeof updates = { ...updates }
  if ('start_time' in cleaned && !cleaned.start_time) cleaned.start_time = undefined
  if ('end_time' in cleaned && !cleaned.end_time) cleaned.end_time = undefined

  const { data, error } = await supabase
    .from('items')
    .update(cleaned)
    .eq('id', itemId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('items').delete().eq('id', itemId)
  if (error) throw error
}

// ─── Accommodation ────────────────────────────────────────────────────────────

export async function getAccommodation(tripId: string): Promise<Accommodation[]> {
  const { data, error } = await supabase
    .from('accommodation')
    .select('*')
    .eq('trip_id', tripId)
    .order('check_in')
  if (error) throw error
  return data ?? []
}

export async function addAccommodation(
  tripId: string,
  input: Pick<Accommodation, 'name' | 'check_in' | 'check_out' | 'address' | 'confirmation' | 'confirmed'>
): Promise<Accommodation> {
  const { data, error } = await supabase
    .from('accommodation')
    .insert({ trip_id: tripId, ...input })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAccommodation(
  id: string,
  updates: Partial<Omit<Accommodation, 'id' | 'trip_id'>>
): Promise<Accommodation> {
  const { data, error } = await supabase
    .from('accommodation')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAccommodation(id: string): Promise<void> {
  const { error } = await supabase.from('accommodation').delete().eq('id', id)
  if (error) throw error
}

// ─── Travel Tools ─────────────────────────────────────────────────────────────

export async function getTravelTools(userId: string): Promise<TravelTool[]> {
  const { data, error } = await supabase
    .from('travel_tools')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

export async function addTravelTool(
  userId: string,
  input: Pick<TravelTool, 'title' | 'url' | 'description'>
): Promise<TravelTool> {
  const { data, error } = await supabase
    .from('travel_tools')
    .insert({ user_id: userId, ...input })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTravelTool(
  id: string,
  updates: Partial<Pick<TravelTool, 'title' | 'url' | 'description'>>
): Promise<TravelTool> {
  const { data, error } = await supabase
    .from('travel_tools')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTravelTool(id: string): Promise<void> {
  const { error } = await supabase.from('travel_tools').delete().eq('id', id)
  if (error) throw error
}

// ─── All confirmed items (for Reservations page) ──────────────────────────────

export async function getUpcomingReservations(userId: string): Promise<(Item & {
  day_date: string
  trip_name: string
})[]> {
  const { data, error } = await supabase
    .from('items')
    .select(`
      *,
      days!inner(date, trips!inner(name, created_by))
    `)
    .eq('confirmed', true)
    .eq('days.trips.created_by', userId)
    .order('days(date)', { ascending: true })

  if (error) throw error

  return (data ?? []).map((item: any) => ({
    ...item,
    day_date: item.days.date,
    trip_name: item.days.trips.name,
  }))
}

// ─── Days (internal) ─────────────────────────────────────────────────────────

async function generateDays(
  tripId: string,
  startDate: string,
  duration: number
): Promise<void> {
  const days = Array.from({ length: duration }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return {
      trip_id: tripId,
      date: d.toISOString().split('T')[0],
      day_index: i + 1,
    }
  })
  const { error } = await supabase.from('days').insert(days)
  if (error) throw error
}

async function regenerateDays(tripId: string): Promise<void> {
  const { data: trip } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single()
  if (!trip) return

  // Get existing days with their items
  const { data: existingDays } = await supabase
    .from('days')
    .select('id, day_index, items(id)')
    .eq('trip_id', tripId)
    .order('day_index')

  const newDuration = trip.duration_days
  const newStartDate = trip.start_date

  // Days beyond new duration — delete items on those days first, then the days
  const daysToRemove = (existingDays ?? []).filter((d) => d.day_index > newDuration)
  for (const day of daysToRemove) {
    await supabase.from('items').delete().eq('day_id', day.id)
    await supabase.from('days').delete().eq('id', day.id)
  }

  // Days within new duration — just update their date
  const daysToKeep = (existingDays ?? []).filter((d) => d.day_index <= newDuration)
  for (const day of daysToKeep) {
    const d = new Date(newStartDate)
    d.setDate(d.getDate() + day.day_index - 1)
    await supabase
      .from('days')
      .update({ date: d.toISOString().split('T')[0] })
      .eq('id', day.id)
  }

  // If duration increased, add new days
  const existingCount = daysToKeep.length
  if (newDuration > existingCount) {
    const newDays = Array.from({ length: newDuration - existingCount }, (_, i) => {
      const d = new Date(newStartDate)
      d.setDate(d.getDate() + existingCount + i)
      return {
        trip_id: tripId,
        date: d.toISOString().split('T')[0],
        day_index: existingCount + i + 1,
      }
    })
    await supabase.from('days').insert(newDays)
  }
}

// ─── Invites ──────────────────────────────────────────────────────────────────

export async function inviteToTrip(
  tripId: string,
  invitedEmail: string,
  invitedBy: string,
  invitedByEmail: string,
  tripName: string,
  role: 'editor' | 'viewer' = 'editor'
): Promise<void> {
  // Record the invite
  const { error } = await supabase
    .from('trip_invites')
    .insert({ trip_id: tripId, invited_email: invitedEmail, invited_by: invitedBy, role })

  if (error) throw error

  // Trigger edge function to send magic link
  const { error: fnError } = await supabase.functions.invoke('send-trip-invite', {
    body: { trip_id: tripId, trip_name: tripName, invited_email: invitedEmail, invited_by_email: invitedByEmail, role },
  })

  if (fnError) throw fnError
}

export async function getTripMembers(tripId: string): Promise<{
  id: string; user_id: string; role: string; email: string
}[]> {
  const { data, error } = await supabase
    .from('trip_members')
    .select('id, user_id, role')
    .eq('trip_id', tripId)

  if (error) throw error

  // Look up emails
  const members = await Promise.all(
    (data ?? []).map(async (m) => {
      const { data: u } = await supabase
        .from('user_emails')
        .select('email')
        .eq('id', m.user_id)
        .single()
      return { ...m, email: u?.email ?? 'Unknown' }
    })
  )
  return members
}

export async function getPendingInvites(tripId: string): Promise<{
  id: string; invited_email: string; role: string
}[]> {
  const { data, error } = await supabase
    .from('trip_invites')
    .select('id, invited_email, role')
    .eq('trip_id', tripId)
    .eq('accepted', false)

  if (error) throw error
  return data ?? []
}

export async function removeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.from('trip_invites').delete().eq('id', inviteId)
  if (error) throw error
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('trip_members').delete().eq('id', memberId)
  if (error) throw error
}

// Updated getUserTrips — now returns trips you're a member of, not just ones you created
export async function getUserTrips(userId: string): Promise<(Trip & { is_owner: boolean })[]> {
  const { data, error } = await supabase
    .from('trip_members')
    .select('role, trips(*)')
    .eq('user_id', userId)
    .order('created_at', { referencedTable: 'trips', ascending: false })

  if (error) throw error

  return (data ?? []).map((row: any) => ({
    ...row.trips,
    is_owner: row.role === 'owner',
  }))
}