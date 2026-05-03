'use client'

import { useEffect, useRef, useState } from 'react'
import type { Day, Item, Accommodation, ItemType } from '@/lib/types'

const TYPE_COLOURS: Record<string, string> = {
  flight:    '#374151',
  transport: '#22c55e',
  activity:  '#f59e0b',
  food:      '#7c3aed',
  photo:     '#0d9488',
  museum:    '#ca8a04',
  shopping:  '#1e3a8a',
  markets:   '#84cc16',
  bakery:    '#ea580c',
  show:      '#e11d48',
}

interface MapPin {
  lat: number
  lng: number
  label: string
  type: string
  item?: Item
  sortKey: number
}

interface TripMapProps {
  days: Day[]
  accom: Accommodation[]
  onSelectItem: (item: Item) => void
  selectedItemId?: string | null
  mode: 'day' | 'trip'
  activeDayId?: string | null
}

function buildPins(days: Day[], mode: 'day' | 'trip', activeDayId?: string | null): MapPin[] {
  const pins: MapPin[] = []
  const targetDays = mode === 'day' ? days.filter((d) => d.id === activeDayId) : days

  for (const day of targetDays) {
    const sorted = sortItemsByTime(day.items)
    sorted.forEach((item, idx) => {
      const sortKey = day.day_index * 1000 + idx

      if (item.location_lat && item.location_lng) {
        pins.push({
          lat: item.location_lat,
          lng: item.location_lng,
          label: item.title || 'Untitled',
          type: item.type,
          item,
          sortKey,
        })
      }

      if (item.type === 'flight' || item.type === 'transport') {
        if (item.location_from_lat && item.location_from_lng) {
          pins.push({
            lat: item.location_from_lat,
            lng: item.location_from_lng,
            label: item.location_from || 'Departure',
            type: item.type,
            item,
            sortKey: sortKey - 0.5,
          })
        }
        if (item.location_to_lat && item.location_to_lng) {
          pins.push({
            lat: item.location_to_lat,
            lng: item.location_to_lng,
            label: item.location_to || 'Arrival',
            type: item.type,
            item,
            sortKey: sortKey + 0.5,
          })
        }
      }
    })
  }

  return pins.sort((a, b) => a.sortKey - b.sortKey)
}

// Inline sort helper (can't import from TripView)
function sortItemsByTime(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    if (!a.start_time && !b.start_time) return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (!a.start_time) return 1
    if (!b.start_time) return -1
    return a.start_time.localeCompare(b.start_time)
  })
}

export default function TripMap({ days, accom, onSelectItem, selectedItemId, mode, activeDayId }: TripMapProps) {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [L, setL] = useState<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const markersRef = useRef<any[]>([])
  const polylinesRef = useRef<any[]>([])
  const initialFitDoneRef = useRef(false)

  const pins = buildPins(days, mode, activeDayId)
  const hasLocations = pins.length > 0

  // Load Leaflet dynamically
  useEffect(() => {
    import('leaflet').then((leaflet) => {
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      setL(leaflet)
    })
  }, [])

  // Initialise map once
  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    setMapReady(true)
    return () => {
      map.remove()
      mapRef.current = null
      initialFitDoneRef.current = false
    }
  }, [L])

  // Invalidate map size when container becomes visible
  // Fixes issue 4 — map not rendering correctly when tab is switched to
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    setTimeout(() => {
      mapRef.current?.invalidateSize()
    }, 50)
  }, [mapReady, activeDayId, mode])

  // Update markers whenever pins or selection changes
  // Fixes issue 6 — reordering items updates the map
  useEffect(() => {
    if (!mapReady || !L || !mapRef.current) return
    const map = mapRef.current

    // Clear existing markers and lines
    markersRef.current.forEach((m) => m.remove())
    polylinesRef.current.forEach((p) => p.remove())
    markersRef.current = []
    polylinesRef.current = []

    if (pins.length === 0) return

    // Draw markers
    pins.forEach((pin, idx) => {
      const colour = TYPE_COLOURS[pin.type] ?? '#6b7280'
      const isSelected = pin.item?.id === selectedItemId
      const size = isSelected ? 34 : 26

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background: ${colour};
            border: 2.5px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            font-size: 10px;
            font-weight: 700;
            color: white;
          ">${idx + 1}</div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      })

      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(map)
        .bindTooltip(pin.label, { permanent: false, direction: 'top', offset: [0, -(size / 2 + 4)] })

      if (pin.item) {
        marker.on('click', (e: any) => {
          // Issue 5 — stop propagation and DON'T call fitBounds on click
          L.DomEvent.stopPropagation(e)
          onSelectItem(pin.item!)
        })
      }

      markersRef.current.push(marker)
    })

    // Draw connecting lines
    for (let i = 0; i < pins.length - 1; i++) {
      const from = pins[i]
      const to = pins[i + 1]
      const isTransit = from.type === 'flight' || from.type === 'transport'

      const line = L.polyline(
        [[from.lat, from.lng], [to.lat, to.lng]],
        {
          color: TYPE_COLOURS[from.type] ?? '#6b7280',
          weight: isTransit ? 2 : 1.5,
          opacity: 0.5,
          dashArray: isTransit ? '6 4' : undefined,
        }
      ).addTo(map)
      polylinesRef.current.push(line)
    }

    // Only fit bounds on the very first load — not on subsequent updates
    // Fixes issue 5 — preserves zoom when items are clicked or reordered
    if (!initialFitDoneRef.current && pins.length > 0) {
      const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
      initialFitDoneRef.current = true
    }
  }, [mapReady, L, pins.length, selectedItemId,
    // Include a serialised version of pin positions and order so reordering triggers update
    pins.map((p) => `${p.lat},${p.lng},${p.sortKey}`).join('|')
  ])

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
        {Object.entries(TYPE_COLOURS).map(([type, colour]) => (
          <div key={type} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: colour }} />
            <span className="text-xs text-gray-600 capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  )
}