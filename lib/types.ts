// ─────────────────────────────────────────────────────────────────────────────
// Existing types (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export type ItemType = 'flight' | 'activity' | 'food' | 'transport' | 'photo' | 'museum' | 'shopping' | 'markets' | 'bakery' | 'show' | 'tour' | 'drive'

export interface Trip {
  id: string
  name: string
  start_date: string
  duration_days: number
  created_by: string
  created_at: string
  image_url?: string
}

export interface Day {
  id: string
  trip_id: string
  day_index: number
  date: string
  notes?: string
  items: Item[]
}

export interface Item {
  id: string
  trip_id: string
  day_id: string
  type: ItemType
  title: string
  subtitle?: string
  notes?: string
  start_time?: string
  end_time?: string
  duration_minutes?: number
  confirmation?: string
  confirmed?: boolean
  sort_order: number
  image_url?: string
  time_locked?: boolean
  location?: string
  location_lat?: number
  location_lng?: number
  location_from?: string
  location_from_lat?: number
  location_from_lng?: number
  location_to?: string
  location_to_lat?: number
  location_to_lng?: number
}

export interface Accommodation {
  id: string
  trip_id: string
  name: string
  address?: string
  check_in: string
  check_out: string
  confirmation?: string
  confirmed?: boolean
  notes?: string
}

export interface TravelTool {
  id: string
  user_id: string
  title: string
  url: string
  description?: string
  sort_order: number
}

export interface TripMember {
  id: string
  trip_id: string
  user_id: string
  role: 'owner' | 'editor' | 'viewer'
}

export interface Profile {
  id: string
  display_name?: string
  avatar_url?: string
  email?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Itinerary types
// ─────────────────────────────────────────────────────────────────────────────

export type ItineraryMode  = 'Flight' | 'Transit' | 'Tour' | 'Experience' | 'Maximise' | 'Reset'
export type FareType       = 'Full fare' | 'ID90' | 'ZED' | 'Staff standby'
export type ActivityTier   = 'must' | 'nice' | 'optional'
export type AccomType      = 'Boutique' | 'Budget' | 'Apartment' | 'Camping' | 'Hostel' | 'Resort' | 'TBD'
export type BookingStatus  = 'unplanned' | 'researching' | 'noted' | 'booked'
export type ItineraryRole  = 'owner' | 'editor' | 'viewer'

// ── DB row shapes ─────────────────────────────────────────────────────────────

export interface ItineraryRow {
  id: string
  user_id: string
  title: string
  year_label: string | null
  start_date: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface LegRow {
  id: string
  itinerary_id: string
  sort_order: number
  region: string
  mode: ItineraryMode
  destination: string
  duration_days: number
  daily_budget_aud: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TransitDetailRow {
  id: string
  leg_id: string
  from_airport: string
  to_airport: string
  via_airport: string | null
  airline: string | null
  fare_type: FareType
  flight_class: string | null
  cost_aud: number | null
  booking_notes: string | null
  created_at: string
  updated_at: string
}

export interface ActivityRow {
  id: string
  leg_id: string
  sort_order: number
  description: string
  tier: ActivityTier
  category: string | null
  cost_aud: number | null
  created_at: string
}

export interface AccomNoteRow {
  id: string
  leg_id: string
  sort_order: number
  accom_type: AccomType
  name: string | null
  notes: string | null
  booking_status: BookingStatus
  cost_per_night_aud: number | null
  created_at: string
  updated_at: string
}

export interface ItineraryMemberRow {
  id: string
  itinerary_id: string
  user_id: string
  role: ItineraryRole
  email: string
  created_at: string
}

export interface ItineraryInviteRow {
  id: string
  itinerary_id: string
  invited_email: string
  invited_by: string
  role: ItineraryRole
  created_at: string
}

// ── Hydrated client-side shapes ───────────────────────────────────────────────

export interface Activity {
  id: string
  sort_order: number
  description: string
  tier: ActivityTier
  category: string
  cost_aud: string
}

export interface AccomNote {
  id: string
  sort_order: number
  accom_type: AccomType
  name: string
  notes: string
  booking_status: BookingStatus
  cost_per_night_aud: string
}

export interface TransitDetail {
  id: string
  from_airport: string
  to_airport: string
  via_airport: string
  airline: string
  fare_type: FareType
  flight_class: string
  cost_aud: string
  booking_notes: string
}

export interface ItineraryLeg {
  id: string
  itinerary_id: string
  sort_order: number
  region: string
  mode: ItineraryMode
  destination: string
  duration_days: number
  daily_budget_aud: string
  notes: string
  transit: TransitDetail | null
  activities: Activity[]
  accom: AccomNote[]
}

export interface Itinerary {
  id: string
  user_id: string
  title: string
  year_label: string
  start_date: string
  notes: string
  legs: ItineraryLeg[]
}

// ── hydrateLeg ────────────────────────────────────────────────────────────────

export function hydrateLeg(
  row: LegRow,
  transit: TransitDetailRow | null,
  activities: ActivityRow[],
  accom: AccomNoteRow[],
): ItineraryLeg {
  return {
    id: row.id,
    itinerary_id: row.itinerary_id,
    sort_order: row.sort_order,
    region: row.region,
    mode: row.mode,
    destination: row.destination,
    duration_days: row.duration_days,
    daily_budget_aud: row.daily_budget_aud != null ? String(row.daily_budget_aud) : '',
    notes: row.notes ?? '',
    transit: transit ? {
      id: transit.id,
      from_airport: transit.from_airport,
      to_airport: transit.to_airport,
      via_airport: transit.via_airport ?? '',
      airline: transit.airline ?? '',
      fare_type: transit.fare_type,
      flight_class: transit.flight_class ?? '',
      cost_aud: transit.cost_aud != null ? String(transit.cost_aud) : '',
      booking_notes: transit.booking_notes ?? '',
    } : null,
    activities: activities.map(a => ({
      id: a.id,
      sort_order: a.sort_order,
      description: a.description,
      tier: a.tier,
      category: a.category ?? '',
      cost_aud: a.cost_aud != null ? String(a.cost_aud) : '',
    })),
    accom: accom.map(a => ({
      id: a.id,
      sort_order: a.sort_order,
      accom_type: a.accom_type,
      name: a.name ?? '',
      notes: a.notes ?? '',
      booking_status: a.booking_status,
      cost_per_night_aud: a.cost_per_night_aud != null ? String(a.cost_per_night_aud) : '',
    })),
  }
}

// ── Budget helpers ────────────────────────────────────────────────────────────

export interface BudgetSummary {
  transitTotal: number
  accomTotal: number
  activitiesTotal: number
  livingTotal: number
  grandTotal: number
  avgDailyBudget: number
  totalDays: number
}

export function computeBudget(legs: ItineraryLeg[]): BudgetSummary {
  let transitTotal    = 0
  let accomTotal      = 0
  let activitiesTotal = 0
  let livingTotal     = 0
  let totalDays       = 0
  let weightedDaily   = 0

  for (const leg of legs) {
    const days = leg.duration_days
    totalDays += days

    if ((leg.mode === 'Transit' || leg.mode === 'Flight') && leg.transit?.cost_aud) {
      transitTotal += Number(leg.transit.cost_aud) || 0
    }

    for (const a of leg.accom) {
      accomTotal += (Number(a.cost_per_night_aud) || 0) * days
    }

    for (const a of leg.activities) {
      activitiesTotal += Number(a.cost_aud) || 0
    }

    const daily = Number(leg.daily_budget_aud) || 0
    livingTotal   += daily * days
    weightedDaily += daily * days
  }

  return {
    transitTotal,
    accomTotal,
    activitiesTotal,
    livingTotal,
    grandTotal: transitTotal + accomTotal + activitiesTotal + livingTotal,
    avgDailyBudget: totalDays > 0 ? weightedDaily / totalDays : 0,
    totalDays,
  }
}