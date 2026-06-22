'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import Sidebar from './Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        return
      }
      // Retry up to 3 times in case of transient failure
      let data = null
      for (let i = 0; i < 3; i++) {
        const res = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
        if (res.data) { data = res.data; break }
        await new Promise(r => setTimeout(r, 500))
      }
      // Fallback: build minimal profile from auth session so sidebar always shows something
      if (!data) {
        data = {
          id: session.user.id,
          email: session.user.email ?? '',
          full_name: session.user.email?.split('@')[0] ?? 'User',
          role: 'executive',
          avatar_url: null,
          created_at: session.user.created_at,
        }
      }
      setProfile(data)
      setLoading(false)
    })
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile} />
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}
