// lib/itinerary.ts
// ─────────────────────────────────────────────────────────────────────────────
// All Supabase reads and writes for the itinerary planner.
// The page imports from here — no raw supabase calls in components.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'
import type {
  ItineraryRow,
  LegRow,
  TransitDetailRow,
  ActivityRow,
  AccomNoteRow,
  Itinerary,
  ItineraryLeg,
  TransitDetail,
  Activity,
  AccomNote,
  ItineraryMode,
  FareType,
  ActivityTier,
  AccomType,
  BookingStatus,
  hydrateLeg as HydrateLeg,
} from '@/lib/types'
import { hydrateLeg } from '@/lib/types'

// ── Read ──────────────────────────────────────────────────────────────────────
// ── PATCH for lib/itinerary.ts ────────────────────────────────────────────────
// Replace the existing fetchItinerary function with this version.
// Only change: accepts an optional itineraryId parameter so the page can
// load a specific itinerary when switching between them.

export async function fetchItinerary(userId: string, itineraryId?: string): Promise<Itinerary | null> {
  // 1. Fetch the itinerary header
  let query = supabase
    .from('itineraries')
    .select('*')
    .eq('user_id', userId)

  if (itineraryId) {
    query = query.eq('id', itineraryId)
  } else {
    query = query.order('created_at', { ascending: true }).limit(1)
  }

  const { data: itinRow, error: itinErr } = await query.maybeSingle()

  if (itinErr) throw itinErr
  if (!itinRow) return null

  // 2. Fetch all legs for this itinerary
  const { data: legRows, error: legsErr } = await supabase
    .from('itinerary_legs')
    .select('*')
    .eq('itinerary_id', itinRow.id)
    .order('sort_order', { ascending: true })

  if (legsErr) throw legsErr
  const legs = legRows ?? []
  if (legs.length === 0) {
    return {
      id: itinRow.id,
      user_id: itinRow.user_id,
      title: itinRow.title,
      year_label: itinRow.year_label ?? '',
      start_date: itinRow.start_date,
      notes: itinRow.notes ?? '',
      legs: [],
    }
  }

  const legIds = legs.map((l: any) => l.id)

  // 3. Fetch all child rows in parallel
  const [transitRes, activitiesRes, accomRes] = await Promise.all([
    supabase.from('itinerary_transit_details').select('*').in('leg_id', legIds),
    supabase.from('itinerary_activities').select('*').in('leg_id', legIds).order('sort_order', { ascending: true }),
    supabase.from('itinerary_accommodation_notes').select('*').in('leg_id', legIds).order('sort_order', { ascending: true }),
  ])

  if (transitRes.error)    throw transitRes.error
  if (activitiesRes.error) throw activitiesRes.error
  if (accomRes.error)      throw accomRes.error

  // 4. Index child rows by leg_id
  const transitByLeg = new Map<string, any>()
  for (const t of transitRes.data ?? []) transitByLeg.set(t.leg_id, t)

  const activitiesByLeg = new Map<string, any[]>()
  for (const a of activitiesRes.data ?? []) {
    const arr = activitiesByLeg.get(a.leg_id) ?? []
    arr.push(a)
    activitiesByLeg.set(a.leg_id, arr)
  }

  const accomByLeg = new Map<string, any[]>()
  for (const a of accomRes.data ?? []) {
    const arr = accomByLeg.get(a.leg_id) ?? []
    arr.push(a)
    accomByLeg.set(a.leg_id, arr)
  }

  // 5. Hydrate
  const hydratedLegs = legs.map((leg: any) =>
    hydrateLeg(
      leg,
      transitByLeg.get(leg.id) ?? null,
      activitiesByLeg.get(leg.id) ?? [],
      accomByLeg.get(leg.id) ?? [],
    )
  )

  return {
    id: itinRow.id,
    user_id: itinRow.user_id,
    title: itinRow.title,
    year_label: itinRow.year_label ?? '',
    start_date: itinRow.start_date,
    notes: itinRow.notes ?? '',
    legs: hydratedLegs,
  }
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createItinerary(
  userId: string,
  title: string,
  startDate: string,
  yearLabel = 'Year 1',
): Promise<ItineraryRow> {
  const { data, error } = await supabase
    .from('itineraries')
    .insert({ user_id: userId, title, start_date: startDate, year_label: yearLabel })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createLeg(
  itineraryId: string,
  sortOrder: number,
  patch: Partial<Pick<LegRow, 'region' | 'mode' | 'destination' | 'duration_days' | 'notes'>>,
): Promise<LegRow> {
  const { data, error } = await supabase
    .from('itinerary_legs')
    .insert({
      itinerary_id: itineraryId,
      sort_order: sortOrder,
      region: patch.region ?? '',
      mode: patch.mode ?? 'Experience',
      destination: patch.destination ?? 'New destination',
      duration_days: patch.duration_days ?? 7,
      notes: patch.notes ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateItinerary(
  id: string,
  patch: Partial<Pick<ItineraryRow, 'title' | 'year_label' | 'start_date' | 'notes'>>,
): Promise<void> {
  const { error } = await supabase
    .from('itineraries')
    .update(patch)
    .eq('id', id)

  if (error) throw error
}

export async function updateLeg(
  id: string,
  patch: Partial<Pick<LegRow, 'region' | 'mode' | 'destination' | 'duration_days' | 'notes' | 'sort_order'>>,
): Promise<void> {
  const { error } = await supabase
    .from('itinerary_legs')
    .update(patch)
    .eq('id', id)

  if (error) throw error
}

/**
 * Upsert transit details for a leg.
 * Creates the row if it doesn't exist, updates if it does.
 */
export async function upsertTransitDetail(
  legId: string,
  detail: Omit<TransitDetail, 'id'>,
): Promise<void> {
  const { error } = await supabase
    .from('itinerary_transit_details')
    .upsert({
      leg_id: legId,
      from_airport: detail.from_airport,
      to_airport: detail.to_airport,
      via_airport: detail.via_airport || null,
      airline: detail.airline || null,
      fare_type: detail.fare_type,
      flight_class: detail.flight_class || null,
      cost_aud: detail.cost_aud ? Number(detail.cost_aud) : null,
      booking_notes: detail.booking_notes || null,
    }, { onConflict: 'leg_id' })

  if (error) throw error
}

export async function upsertActivity(activity: Activity & { leg_id: string }): Promise<void> {
  const { error } = await supabase
    .from('itinerary_activities')
    .upsert({
      id: activity.id,
      leg_id: activity.leg_id,
      sort_order: activity.sort_order,
      description: activity.description,
      tier: activity.tier,
      category: activity.category || null,
    })

  if (error) throw error
}

export async function upsertAccomNote(note: AccomNote & { leg_id: string }): Promise<void> {
  const { error } = await supabase
    .from('itinerary_accommodation_notes')
    .upsert({
      id: note.id,
      leg_id: note.leg_id,
      sort_order: note.sort_order,
      accom_type: note.accom_type,
      name: note.name || null,
      notes: note.notes || null,
      booking_status: note.booking_status,
    })

  if (error) throw error
}

/**
 * Reorder legs after drag-and-drop or insert.
 * Sends only the id + sort_order pairs that need updating.
 */
export async function reorderLegs(
  updates: { id: string; sort_order: number }[],
): Promise<void> {
  const { error } = await supabase
    .from('itinerary_legs')
    .upsert(updates)

  if (error) throw error
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteLeg(id: string): Promise<void> {
  const { error } = await supabase
    .from('itinerary_legs')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase
    .from('itinerary_activities')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function deleteAccomNote(id: string): Promise<void> {
  const { error } = await supabase
    .from('itinerary_accommodation_notes')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function deleteTransitDetail(legId: string): Promise<void> {
  const { error } = await supabase
    .from('itinerary_transit_details')
    .delete()
    .eq('leg_id', legId)

  if (error) throw error
}

// ── Bulk save helpers ─────────────────────────────────────────────────────────
// Called from the page when a leg's detail panel is closed or explicitly saved.
// Diffs are handled in the component; these just flush the current state.

export async function saveLeg(leg: ItineraryLeg): Promise<void> {
  // 1. Core leg fields
  await updateLeg(leg.id, {
    region: leg.region,
    mode: leg.mode,
    destination: leg.destination,
    duration_days: leg.duration_days,
    notes: leg.notes || null,
    sort_order: leg.sort_order,
  })

  // 2. Transit — upsert or delete depending on mode
  if (leg.mode === 'Transit' && leg.transit) {
    await upsertTransitDetail(leg.id, leg.transit)
  } else if (leg.mode !== 'Transit') {
    // Mode changed away from Transit — clean up orphaned detail row
    await deleteTransitDetail(leg.id)
  }

  // 3. Activities — upsert all current, delete any removed ones handled separately
  await Promise.all(
    leg.activities.map((a, i) =>
      upsertActivity({ ...a, leg_id: leg.id, sort_order: i })
    )
  )

  // 4. Accommodation notes
  await Promise.all(
    leg.accom.map((a, i) =>
      upsertAccomNote({ ...a, leg_id: leg.id, sort_order: i })
    )
  )
}