export type ItemType = 'travel' | 'stay' | 'activity' | 'food' | 'transport'

export interface Trip {
  id: string
  name: string
  start_date: string
  duration_days: number
  created_by: string
  created_at: string
}

export interface Day {
  id: string
  trip_id: string
  day_index: number
  date: string
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
  confirmation?: string
  confirmed?: boolean
  sort_order: number
  image_url?: string
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