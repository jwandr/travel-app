'use client'

import { useState, useRef } from 'react'
import { geocode } from '@/lib/geocode'

interface LocationInputProps {
  value: string
  placeholder?: string
  onChange: (value: string, lat?: number, lng?: number) => void
}

export default function LocationInput({
  value,
  placeholder = 'e.g. Kiyomizu-dera Temple, Kyoto',
  onChange,
}: LocationInputProps) {
  const [text, setText] = useState(value)
  const [geocoding, setGeocoding] = useState(false)
  const [status, setStatus] = useState<'idle' | 'found' | 'notfound'>('idle')

  const handleBlur = async () => {
    const trimmed = text.trim()

    // Field was cleared — save null explicitly
    if (!trimmed) {
      if (value) {
        onChange('', undefined, undefined)
      }
      setStatus('idle')
      return
    }

    // Value unchanged — no need to re-geocode
    if (trimmed === value) return

    setGeocoding(true)
    setStatus('idle')

    try {
      const result = await geocode(trimmed)
      if (result) {
        setStatus('found')
        onChange(trimmed, result.lat, result.lng)
      } else {
        setStatus('notfound')
        onChange(trimmed, undefined, undefined)
      }
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={text}
        onChange={(e) => { setText(e.target.value); setStatus('idle') }}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 pr-8"
      />
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
        {geocoding && (
          <span className="material-symbols-rounded text-gray-300 animate-spin" style={{ fontSize: 16 }}>refresh</span>
        )}
        {!geocoding && status === 'found' && (
          <span className="material-symbols-rounded text-green-500" style={{ fontSize: 16 }}>check_circle</span>
        )}
        {!geocoding && status === 'notfound' && (
          <span className="material-symbols-rounded text-amber-400" style={{ fontSize: 16 }}>help</span>
        )}
        {!geocoding && status === 'idle' && text && (
          <span className="material-symbols-rounded text-gray-300" style={{ fontSize: 16 }}>location_on</span>
        )}
      </div>
    </div>
  )
}