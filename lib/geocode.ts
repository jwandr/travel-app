export interface GeoResult {
  lat: number
  lng: number
  displayName: string
}

// Simple in-memory cache to avoid repeat lookups
const cache = new Map<string, GeoResult | null>()

export async function geocode(query: string): Promise<GeoResult | null> {
  const key = query.toLowerCase().trim()
  if (!key) return null
  if (cache.has(key)) return cache.get(key)!

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(key)}&format=json&limit=1`
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'TravelPlannerApp/1.0' },
    })
    const data = await res.json()
    if (!data.length) { cache.set(key, null); return null }
    const result: GeoResult = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    }
    cache.set(key, result)
    return result
  } catch {
    return null
  }
}