'use client'

import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { label: 'Trips',         icon: 'luggage',      href: '/dashboard' },
  { label: 'Travel Tools',  icon: 'build',        href: '/travel-tools' },
  { label: 'Reservations',  icon: 'confirmation_number', href: '/reservations' },
]

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-rounded ${className}`} style={{ fontSize: 20 }}>
      {name}
    </span>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-52 shrink-0 bg-white border-r border-gray-100 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-gray-100">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <Icon name="flight" className="text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">Travel Planner</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href === '/dashboard' && pathname.startsWith('/trip'))
            return (
              <button
                key={item.href}
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

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}