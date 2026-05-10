import { Suspense } from 'react'
import InviteHandler from './InviteHandler'

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">Setting up your access…</div>
      </div>
    }>
      <InviteHandler />
    </Suspense>
  )
}