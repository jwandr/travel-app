// lib/itinerary.ts
import { supabase } from '@/lib/supabase'
import { hydrateLeg } from '@/lib/types'
import type {
  Itinerary,
  ItineraryRow,
  ItineraryLeg,
  TransitDetailRow,
  ActivityRow,
  AccomNoteRow,
  ItineraryMemberRow,
  ItineraryInviteRow,
  ItineraryRole,
} from '@/lib/types'

// ── Read ──────────────────────────────────────────────────────────────────────

export async function fetchItinerary(userId: string, itineraryId?: string): Promise<Itinerary | null> {
  let query = supabase.from('itineraries').select('*').eq('user_id', userId)
  if (itineraryId) query = query.eq('id', itineraryId)
  else query = query.order('created_at', { ascending: true }).limit(1)

  const { data: itinRow, error: itinErr } = await query.maybeSingle()
  if (itinErr) throw itinErr
  if (!itinRow) return null

  const { data: legRows, error: legsErr } = await supabase
    .from('itinerary_legs').select('*')
    .eq('itinerary_id', itinRow.id)
    .order('sort_order', { ascending: true })
  if (legsErr) throw legsErr

  const legs = legRows ?? []
  if (legs.length === 0) {
    return { id: itinRow.id, user_id: itinRow.user_id, title: itinRow.title,
      year_label: itinRow.year_label ?? '', start_date: itinRow.start_date,
      notes: itinRow.notes ?? '', legs: [] }
  }

  const legIds = legs.map((l: any) => l.id)
  const [transitRes, activitiesRes, accomRes] = await Promise.all([
    supabase.from('itinerary_transit_details').select('*').in('leg_id', legIds),
    supabase.from('itinerary_activities').select('*').in('leg_id', legIds).order('sort_order', { ascending: true }),
    supabase.from('itinerary_accommodation_notes').select('*').in('leg_id', legIds).order('sort_order', { ascending: true }),
  ])
  if (transitRes.error) throw transitRes.error
  if (activitiesRes.error) throw activitiesRes.error
  if (accomRes.error) throw accomRes.error

  const transitByLeg = new Map<string, TransitDetailRow>()
  for (const t of transitRes.data ?? []) transitByLeg.set(t.leg_id, t)

  const activitiesByLeg = new Map<string, ActivityRow[]>()
  for (const a of activitiesRes.data ?? []) {
    const arr = activitiesByLeg.get(a.leg_id) ?? []; arr.push(a); activitiesByLeg.set(a.leg_id, arr)
  }

  const accomByLeg = new Map<string, AccomNoteRow[]>()
  for (const a of accomRes.data ?? []) {
    const arr = accomByLeg.get(a.leg_id) ?? []; arr.push(a); accomByLeg.set(a.leg_id, arr)
  }

  return {
    id: itinRow.id, user_id: itinRow.user_id, title: itinRow.title,
    year_label: itinRow.year_label ?? '', start_date: itinRow.start_date,
    notes: itinRow.notes ?? '',
    legs: legs.map((leg: any) => hydrateLeg(
      leg,
      transitByLeg.get(leg.id) ?? null,
      activitiesByLeg.get(leg.id) ?? [],
      accomByLeg.get(leg.id) ?? [],
    )),
  }
}

// ── Update itinerary header ───────────────────────────────────────────────────

export async function updateItinerary(
  id: string,
  patch: Partial<Pick<ItineraryRow, 'title' | 'year_label' | 'start_date' | 'notes'>>,
): Promise<void> {
  const { error } = await supabase.from('itineraries').update(patch).eq('id', id)
  if (error) throw error
}

// ── Save full leg ─────────────────────────────────────────────────────────────

export async function saveLeg(leg: ItineraryLeg): Promise<void> {
  const { error: legErr } = await supabase
    .from('itinerary_legs')
    .update({
      region: leg.region, mode: leg.mode, destination: leg.destination,
      duration_days: leg.duration_days,
      daily_budget_aud: leg.daily_budget_aud ? Number(leg.daily_budget_aud) : null,
      notes: leg.notes || null, sort_order: leg.sort_order,
    })
    .eq('id', leg.id)
  if (legErr) throw legErr

  if (leg.mode === 'Transit' && leg.transit) {
    const { error } = await supabase.from('itinerary_transit_details').upsert({
      leg_id: leg.id,
      from_airport: leg.transit.from_airport, to_airport: leg.transit.to_airport,
      via_airport: leg.transit.via_airport || null, airline: leg.transit.airline || null,
      fare_type: leg.transit.fare_type, flight_class: leg.transit.flight_class || null,
      cost_aud: leg.transit.cost_aud ? Number(leg.transit.cost_aud) : null,
      booking_notes: leg.transit.booking_notes || null,
    }, { onConflict: 'leg_id' })
    if (error) throw error
  } else if (leg.mode !== 'Transit') {
    await supabase.from('itinerary_transit_details').delete().eq('leg_id', leg.id)
  }

  await Promise.all(leg.activities.map((a, i) =>
    supabase.from('itinerary_activities').upsert({
      id: a.id, leg_id: leg.id, sort_order: i,
      description: a.description, tier: a.tier,
      category: a.category || null,
      cost_aud: a.cost_aud ? Number(a.cost_aud) : null,
    })
  ))

  await Promise.all(leg.accom.map((a, i) =>
    supabase.from('itinerary_accommodation_notes').upsert({
      id: a.id, leg_id: leg.id, sort_order: i,
      accom_type: a.accom_type, name: a.name || null,
      notes: a.notes || null, booking_status: a.booking_status,
      cost_per_night_aud: a.cost_per_night_aud ? Number(a.cost_per_night_aud) : null,
    })
  ))
}

// ── Delete helpers ────────────────────────────────────────────────────────────

export async function deleteLeg(id: string): Promise<void> {
  const { error } = await supabase.from('itinerary_legs').delete().eq('id', id)
  if (error) throw error
}

export async function deleteActivity(id: string): Promise<void> {
  await supabase.from('itinerary_activities').delete().eq('id', id)
}

export async function deleteAccomNote(id: string): Promise<void> {
  await supabase.from('itinerary_accommodation_notes').delete().eq('id', id)
}

// ── Sharing: members ──────────────────────────────────────────────────────────

export async function getItineraryMembers(itineraryId: string): Promise<ItineraryMemberRow[]> {
  const { data, error } = await supabase
    .from('itinerary_members')
    .select('id, itinerary_id, user_id, role, created_at, profiles:user_id ( email, display_name )')
    .eq('itinerary_id', itineraryId)
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id, itinerary_id: row.itinerary_id, user_id: row.user_id,
    role: row.role, created_at: row.created_at,
    email: row.profiles?.email ?? row.profiles?.display_name ?? 'Unknown',
  }))
}

export async function removeItineraryMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('itinerary_members').delete().eq('id', memberId)
  if (error) throw error
}

// ── Sharing: invites ──────────────────────────────────────────────────────────

export async function getPendingItineraryInvites(itineraryId: string): Promise<ItineraryInviteRow[]> {
  const { data, error } = await supabase
    .from('itinerary_invites').select('*').eq('itinerary_id', itineraryId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function inviteToItinerary(
  itineraryId: string, invitedEmail: string, invitedBy: string, role: ItineraryRole = 'editor',
): Promise<void> {
  const { error } = await supabase.from('itinerary_invites')
    .insert({ itinerary_id: itineraryId, invited_email: invitedEmail.toLowerCase().trim(), invited_by: invitedBy, role })
  if (error) throw error
}

export async function removeItineraryInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.from('itinerary_invites').delete().eq('id', inviteId)
  if (error) throw error
}

export async function getMyItineraryRole(itineraryId: string, userId: string): Promise<ItineraryRole | null> {
  const { data } = await supabase
    .from('itinerary_members').select('role')
    .eq('itinerary_id', itineraryId).eq('user_id', userId).maybeSingle()
  return (data?.role as ItineraryRole) ?? null
}