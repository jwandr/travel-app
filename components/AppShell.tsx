'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Trip } from '@/lib/types'

const NAV = [
  { label: 'Trips',        icon: 'luggage',              href: '/dashboard' },
  { label: 'Travel Tools', icon: 'build',                href: '/travel-tools' },
  { label: 'Reservations', icon: 'confirmation_number',  href: '/reservations' },
]

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-rounded ${className}`} style={{ fontSize: 20 }}>
      {name}
    </span>
  )
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [upcomingTrips, setUpcomingTrips] = useState<Trip[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date().toISOString().split('T')[0]

      const { data } = await supabase
        .from('trip_members')
        .select('trips(*)')
        .eq('user_id', user.id)

      if (!data) return

      const trips = data
        .map((row: any) => row.trips)
        .filter((t: Trip) => t.start_date >= today)
        .sort((a: Trip, b: Trip) => a.start_date.localeCompare(b.start_date))
        .slice(0, 3)

      setUpcomingTrips(trips)
    }
    load()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isTripsActive = pathname === '/dashboard' || pathname.startsWith('/trip')

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-52 shrink-0 bg-white border-r border-gray-100 flex-col">
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-gray-100">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Icon name="flight" className="text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">Travel Planner</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname === item.href ||
              (item.href === '/dashboard' && isTripsActive)
            return (
              <div key={item.href}>
                <button
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon name={item.icon} className={active ? 'text-indigo-600' : 'text-gray-400'} />
                  {item.label}
                </button>

                {/* Upcoming trips under Trips nav item */}
                {item.href === '/dashboard' && upcomingTrips.length > 0 && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {upcomingTrips.map((trip) => (
                      <button
                        key={trip.id}
                        onClick={() => router.push(`/trip/${trip.id}`)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                          pathname === `/trip/${trip.id}`
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                        }`}
                      >
                        <Icon name="chevron_right" className="text-gray-300 !text-sm shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{trip.name}</div>
                          <div className="text-gray-300">{formatShortDate(trip.start_date)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Promo */}
        <div className="mx-3 mb-3 p-3 bg-indigo-50 rounded-xl">
          <p className="text-xs font-semibold text-gray-800">Plan together,</p>
          <p className="text-xs font-semibold text-gray-800 mb-1">travel better</p>
          <p className="text-xs text-gray-500 mb-2">Share your trip and collaborate in real time.</p>
          <button className="text-xs text-indigo-600 font-medium hover:text-indigo-800 transition-colors">
            Learn more →
          </button>
        </div>

        {/* Bottom */}
        <div className="px-3 pb-4 space-y-0.5 border-t border-gray-100 pt-3">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors text-left">
            <Icon name="settings" className="text-gray-400" /> Settings
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors text-left"
          >
            <Icon name="logout" className="text-gray-400" /> Log out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Mobile top bar */}
        <div className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Icon name="flight" className="text-white !text-sm" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">Travel Planner</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <Icon name={mobileMenuOpen ? 'close' : 'menu'} />
          </button>
        </div>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMobileMenuOpen(false)}>
            <div className="absolute right-0 top-0 bottom-0 w-64 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
                <span className="font-semibold text-gray-900">Menu</span>
                <button onClick={() => setMobileMenuOpen(false)} className="text-gray-400">
                  <Icon name="close" />
                </button>
              </div>
              <nav className="px-3 py-4 space-y-0.5">
                {NAV.map((item) => {
                  const active = pathname === item.href ||
                    (item.href === '/dashboard' && isTripsActive)
                  return (
                    <div key={item.href}>
                      <button
                        onClick={() => { router.push(item.href); setMobileMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors text-left ${
                          active
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <Icon name={item.icon} className={active ? 'text-indigo-600' : 'text-gray-400'} />
                        {item.label}
                      </button>

                      {item.href === '/dashboard' && upcomingTrips.length > 0 && (
                        <div className="ml-4 mt-1 space-y-0.5">
                          {upcomingTrips.map((trip) => (
                            <button
                              key={trip.id}
                              onClick={() => { router.push(`/trip/${trip.id}`); setMobileMenuOpen(false) }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors text-left"
                            >
                              <Icon name="chevron_right" className="text-gray-300 !text-sm shrink-0" />
                              <div className="min-w-0">
                                <div className="truncate font-medium">{trip.name}</div>
                                <div className="text-gray-300">{formatShortDate(trip.start_date)}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </nav>
              <div className="px-3 border-t border-gray-100 pt-3 mt-2">
                <button
                  onClick={() => { handleSignOut(); setMobileMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-gray-500 hover:bg-gray-50 text-left"
                >
                  <Icon name="logout" className="text-gray-400" /> Log out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page content */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>

        {/* Mobile bottom nav */}
        <div className="md:hidden bg-white border-t border-gray-100 px-2 py-2 flex items-center justify-around shrink-0">
          {NAV.map((item) => {
            const active = pathname === item.href ||
              (item.href === '/dashboard' && isTripsActive)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-colors ${
                  active ? 'text-indigo-600' : 'text-gray-400'
                }`}
              >
                <Icon name={item.icon} className={active ? 'text-indigo-600' : 'text-gray-400'} />
                <span className="text-xs">{item.label}</span>
              </button>
            )
          })}
        </div>
      </main>
    </div>
  )
}