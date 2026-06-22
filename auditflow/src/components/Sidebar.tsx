'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth'
import type { Profile } from '@/lib/supabase'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/assignments', label: 'Assignments', icon: '📋' },
  { href: '/observations', label: 'Observations', icon: '🔍' },
  { href: '/timesheets', label: 'Timesheets', icon: '⏱️' },
  { href: '/reports', label: 'Reports', icon: '📈' },
]

const managerOnlyItems = [
  { href: '/audit-trail', label: 'Audit Trail', icon: '🔒' },
]

const adminItems = [
  { href: '/admin', label: 'Admin', icon: '⚙️' },
]

export default function Sidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <aside className="w-64 bg-gray-900 min-h-screen flex flex-col">
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">A</div>
          <div>
            <h1 className="text-white font-bold text-lg leading-none">AuditFlow</h1>
            <p className="text-gray-400 text-xs mt-0.5">Management System</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}

        {profile?.role === 'manager' && (
          <>
            {managerOnlyItems.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}>
                  <span>{item.icon}</span>{item.label}
                </Link>
              )
            })}
            <div className="pt-4 pb-1">
              <p className="text-gray-500 text-xs uppercase tracking-wider px-3">Administration</p>
            </div>
            {adminItems.map(item => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-gray-700">
        {profile && (
          <Link href="/profile" className="flex items-center gap-3 mb-3 hover:bg-gray-800 rounded-lg px-2 py-1.5 -mx-2 transition-colors">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium overflow-hidden flex-shrink-0">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : profile.full_name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{profile.full_name}</p>
              <p className="text-gray-400 text-xs capitalize">{profile.role.replace('_', ' ')}</p>
            </div>
          </Link>
        )}
        <button
          onClick={handleSignOut}
          className="w-full text-left text-gray-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
