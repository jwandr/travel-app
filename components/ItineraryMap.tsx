'use client'

import { useEffect, useRef, useState } from 'react'
import type { ItineraryLeg } from '@/lib/types'

const REGION_COLORS = [
  '#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b',
  '#f43f5e', '#6366f1', '#14b8a6', '#f97316',
]

export default function ItineraryMap({ legs }: { legs: ItineraryLeg[] }) {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [L, setL] = useState<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const markersRef = useRef<any[]>([])
  const polylinesRef = useRef<any[]>([])
  const initialFitDoneRef = useRef(false)

  // Legs with a location, in trip order
  const pins = legs.filter((l) => l.location_lat != null && l.location_lng != null)

  // Stable colour per distinct region, by first appearance
  const colorByRegion = new Map<string, string>()
  for (const leg of pins) {
    if (!colorByRegion.has(leg.region)) {
      colorByRegion.set(leg.region, REGION_COLORS[colorByRegion.size % REGION_COLORS.length])
    }
  }

  useEffect(() => {
    import('leaflet').then((leaflet) => setL(leaflet))
  }, [])

  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    setMapReady(true)
    return () => { map.remove(); mapRef.current = null; initialFitDoneRef.current = false }
  }, [L])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    setTimeout(() => mapRef.current?.invalidateSize(), 50)
  }, [mapReady])

  useEffect(() => {
    if (!mapReady || !L || !mapRef.current) return
    const map = mapRef.current

    markersRef.current.forEach((m) => m.remove())
    polylinesRef.current.forEach((p) => p.remove())
    markersRef.current = []
    polylinesRef.current = []

    if (pins.length === 0) return

    pins.forEach((leg, i) => {
      const colour = colorByRegion.get(leg.region) ?? '#6b7280'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;background:${colour};border:2.5px solid white;
          border-radius:50%;display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:11px;font-weight:700;color:white;">${i + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      const marker = L.marker([leg.location_lat!, leg.location_lng!], { icon })
        .addTo(map)
        .bindTooltip(leg.destination, { permanent: false, direction: 'top', offset: [0, -18] })
      markersRef.current.push(marker)
    })

    for (let i = 0; i < pins.length - 1; i++) {
      const from = pins[i]
      const to = pins[i + 1]
      const line = L.polyline(
        [[from.location_lat!, from.location_lng!], [to.location_lat!, to.location_lng!]],
        { color: '#94a3b8', weight: 2, opacity: 0.7, dashArray: '6 5' }
      ).addTo(map)
      polylinesRef.current.push(line)
    }

    if (!initialFitDoneRef.current) {
      const bounds = L.latLngBounds(pins.map((l) => [l.location_lat!, l.location_lng!]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 })
      initialFitDoneRef.current = true
    }
  }, [mapReady, L, pins.map((l) => `${l.id}:${l.location_lat}:${l.location_lng}`).join('|')])

  const missing = legs.length - pins.length

  if (pins.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-8 flex flex-col items-center justify-center text-gray-400 space-y-2">
        <span className="material-symbols-rounded text-gray-200" style={{ fontSize: 40 }}>map</span>
        <p className="text-sm">No leg locations yet</p>
        <p className="text-xs text-center text-gray-300">Add a location to each leg to see the route here.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Route</div>
        {missing > 0 && (
          <div className="text-xs text-gray-300">{missing} leg{missing !== 1 ? 's' : ''} missing a location</div>
        )}
      </div>
      <div className="relative" style={{ height: 360 }}>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <div ref={containerRef} className="h-full w-full" />
        <div className="absolute bottom-3 left-3 bg-white rounded-xl shadow-lg p-2.5 space-y-1 z-[1000] max-w-[160px]">
          {Array.from(colorByRegion.entries()).map(([region, colour]) => (
            <div key={region} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colour }} />
              <span className="text-xs text-gray-600 truncate">{region}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}