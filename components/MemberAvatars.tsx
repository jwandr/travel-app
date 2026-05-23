'use client'

interface Member {
  user_id: string
  email: string
  display_name?: string
  avatar_url?: string
}

interface MemberAvatarsProps {
  members: Member[]
  currentUserId?: string
  max?: number
  size?: 'sm' | 'md'
  onClick?: () => void
}

function getInitials(member: Member): string {
  if (member.display_name) return member.display_name.slice(0, 1).toUpperCase()
  if (member.email) return member.email.slice(0, 1).toUpperCase()
  return '?'
}

const COLOURS = [
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
]

function getColour(email: string): string {
  return COLOURS[email.charCodeAt(0) % COLOURS.length]
}

export default function MemberAvatars({
  members, currentUserId, max = 4, size = 'md', onClick
}: MemberAvatarsProps) {
  if (members.length === 0) return null

  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-xs'
  const overlapClass = size === 'sm' ? '-ml-2' : '-ml-2.5'
  const shown = members.slice(0, max)
  const overflow = members.length - max

  return (
    <div
      onClick={onClick}
      className={`flex items-center ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      title={members.map((m) => m.display_name || m.email).join(', ')}
    >
      <div className="flex items-center">
        {shown.map((member, idx) => (
          <div
            key={member.user_id}
            className={`${sizeClass} ${idx > 0 ? overlapClass : ''} rounded-full border-2 border-white overflow-hidden shrink-0 flex items-center justify-center font-semibold ${getColour(member.email)}`}
            style={{ zIndex: shown.length - idx }}
          >
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt={member.display_name || member.email}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const el = e.target as HTMLImageElement
                  el.style.display = 'none'
                  el.parentElement!.innerHTML = getInitials(member)
                }}
              />
            ) : (
              getInitials(member)
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div
            className={`${sizeClass} ${overlapClass} rounded-full border-2 border-white bg-gray-100 text-gray-500 shrink-0 flex items-center justify-center font-semibold`}
            style={{ zIndex: 0 }}
          >
            +{overflow}
          </div>
        )}
      </div>
    </div>
  )
}