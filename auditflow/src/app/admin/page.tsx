'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

export default function AdminPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('profiles').select('*').order('created_at').then(({ data }) => {
      setUsers((data as Profile[]) ?? [])
      setLoading(false)
    })
  }, [])

  async function updateRole(userId: string, role: string) {
    setUpdating(userId)
    await supabase.from('profiles').update({ role }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: role as Profile['role'] } : u))
    setUpdating(null)
  }

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">User Administration</h1>
        <p className="text-gray-500 mb-8">Manage users and their roles</p>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{user.full_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={e => updateRole(user.id, e.target.value)}
                        disabled={updating === user.id}
                        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <option value="executive">Executive</option>
                        <option value="assistant_manager">Assistant Manager</option>
                        <option value="manager">Manager</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-8 bg-blue-50 rounded-xl p-6 border border-blue-100">
          <h3 className="font-semibold text-blue-900 mb-2">Add New Users</h3>
          <p className="text-blue-700 text-sm">
            To add new users, go to your Supabase Dashboard → Authentication → Users → Invite User.
            They will receive an email to set their password. Their role will default to &quot;Assistant Manager&quot;
            and can be changed here after they join.
          </p>
        </div>
      </div>
    </AppShell>
  )
}
