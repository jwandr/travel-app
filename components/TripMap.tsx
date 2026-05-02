'use client'

import { useEffect, useRef, useState } from 'react'
import type { Day, Item, Accommodation, ItemType } from '@/lib/types'

const TYPE_COLOURS: Record<string, string> = {
  travel:    '#0ea5e9',
  transport: '#22c55e',
  activity:  '#f59e0b',
  food:      '#f97316',
  photo:     '#ec4899',
  museum:    '#a855f7',
  shopping:  '#f43f5e',
  markets:   '#84cc16',
  bakery:    '#eab308',
}

interface MapPin {
  lat: number
  lng: number
  label: string
  type: ItemType | 'accommodation'
  item?: Item
  accom?: Accommodation
  dayIndex: number
}

interface TripMapProps {
  days: Day[]
  accom: Accommodation[]
  onSelectItem: (item: Item) => void
  selectedItemId?: string | null
  mode: 'day' | 'trip'
  activeDayId?: string | null
}

function buildPins(days: Day[], accom: Accommodation[], mode: 'day' | 'trip', activeDayId?: string | null): MapPin[] {
  const pins: MapPin[] = []
  const targetDays = mode === 'day' ? days.filter((d) => d.id === activeDayId) : days

  for (const day of targetDays) {
    const sorted = [...day.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    for (const item of sorted) {
      if (item.location_lat && item.location_lng) {
        pins.push({
          lat: item.location_lat,
          lng: item.location_lng,
          label: item.title || 'Untitled',
          type: item.type,
          item,
          dayIndex: day.day_index,
        })
      }
      if ((item.type === 'travel' || item.type === 'transport')) {
        if (item.location_from_lat && item.location_from_lng) {
          pins.push({
            lat: item.location_from_lat,
            lng: item.location_from_lng,
            label: item.location_from || 'Departure',
            type: item.type,
            item,
            dayIndex: day.day_index,
          })
        }
        if (item.location_to_lat && item.location_to_lng) {
          pins.push({
            lat: item.location_to_lat,
            lng: item.location_to_lng,
            label: item.location_to || 'Arrival',
            type: item.type,
            item,
            dayIndex: day.day_index,
          })
        }
      }
    }
  }

  // Accommodation pins
  for (const a of accom) {
    const day = targetDays.find((d) => d.date === a.check_in)
    if (!day) continue
    // We don't geocode accommodation yet — skip if no coords stored
  }

  return pins
}

export default function TripMap({ days, accom, onSelectItem, selectedItemId, mode, activeDayId }: TripMapProps) {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [L, setL] = useState<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const markersRef = useRef<any[]>([])
  const polylinesRef = useRef<any[]>([])

  const pins = buildPins(days, accom, mode, activeDayId)
  const hasLocations = pins.length > 0

  // Load Leaflet dynamically (it's browser-only)
  useEffect(() => {
    import('leaflet').then((leaflet) => {
      // Fix default marker icons
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      setL(leaflet)
    })
  }, [])

  // Initialise map
  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    setMapReady(true)
    return () => { map.remove(); mapRef.current = null }
  }, [L])

  // Update markers when pins change
  useEffect(() => {
    if (!mapReady || !L || !mapRef.current) return
    const map = mapRef.current

    // Clear existing
    markersRef.current.forEach((m) => m.remove())
    polylinesRef.current.forEach((p) => p.remove())
    markersRef.current = []
    polylinesRef.current = []

    if (pins.length === 0) return

    // Draw markers
    pins.forEach((pin, idx) => {
      const colour = TYPE_COLOURS[pin.type]
      const isSelected = pin.item?.id === selectedItemId

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            width: ${isSelected ? 36 : 28}px;
            height: ${isSelected ? 36 : 28}px;
            background: ${colour};
            border: 3px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            font-size: 11px;
            font-weight: bold;
            color: white;
            transition: all 0.2s;
          ">${idx + 1}</div>
        `,
        iconSize: [isSelected ? 36 : 28, isSelected ? 36 : 28],
        iconAnchor: [isSelected ? 18 : 14, isSelected ? 18 : 14],
      })

      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(map)
        .bindTooltip(pin.label, { permanent: false, direction: 'top', offset: [0, -10] })

      if (pin.item) {
        marker.on('click', () => onSelectItem(pin.item!))
      }

      markersRef.current.push(marker)
    })

    // Draw route lines connecting pins in order
    if (pins.length > 1) {
      const coords = pins.map((p) => [p.lat, p.lng] as [number, number])

      // For travel/transport items draw arcs, others draw straight lines
      for (let i = 0; i < pins.length - 1; i++) {
        const from = pins[i]
        const to = pins[i + 1]
        const isTransit = from.type === 'travel' || from.type === 'transport'

        const line = L.polyline(
          [from, to].map((p) => [p.lat, p.lng]),
          {
            color: TYPE_COLOURS[from.type],
            weight: isTransit ? 2 : 1.5,
            opacity: 0.6,
            dashArray: isTransit ? '6 4' : undefined,
          }
        ).addTo(map)
        polylinesRef.current.push(line)
      }
    }

    // Fit bounds
    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }, [mapReady, pins.length, selectedItemId, L])

  if (!hasLocations) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3 p-8">
        <span className="material-symbols-rounded text-gray-200" style={{ fontSize: 48 }}>map</span>
        <p className="text-sm font-medium">No locations yet</p>
        <p className="text-xs text-center text-gray-300">
          Add a location to any activity, flight or transport item to see it on the map.
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={containerRef} className="h-full w-full" />
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg p-3 space-y-1.5 z-[1000]">
        {(Object.entries(TYPE_COLOURS) as [string, string][])
          .filter(([k]) => k !== 'accommodation')
          .map(([type, colour]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: colour }} />
              <span className="text-xs text-gray-600 capitalize">{type}</span>
            </div>
          ))}
      </div>
    </div>
  )
}