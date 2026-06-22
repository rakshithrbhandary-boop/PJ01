'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'requests'>('users')
  const [users, setUsers] = useState<Profile[]>([])
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null)

  const [requests, setRequests] = useState<Record<string, unknown>[]>([])
  const [loadingReqs, setLoadingReqs] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('profiles').select('*').order('created_at').then(({ data }) => {
      setUsers((data as Profile[]) ?? [])
      setLoading(false)
    })
    loadRequests()
  }, [])

  async function loadRequests() {
    const { data } = await supabase
      .from('profile_change_requests')
      .select('*, user:profiles!profile_change_requests_user_id_fkey(full_name, email, avatar_url)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setRequests(data ?? [])
    setLoadingReqs(false)
  }

  function handleRoleChange(userId: string, role: string) {
    setPendingRoles(prev => ({ ...prev, [userId]: role }))
  }

  async function saveRole(userId: string) {
    const role = pendingRoles[userId]
    if (!role) return
    setSaving(userId)
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) {
      setMessage({ id: userId, text: 'Failed to save.', ok: false })
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: role as Profile['role'] } : u))
      setPendingRoles(prev => { const n = { ...prev }; delete n[userId]; return n })
      setMessage({ id: userId, text: 'Role updated!', ok: true })
    }
    setSaving(null)
    setTimeout(() => setMessage(null), 3000)
  }

  async function reviewRequest(reqId: string, userId: string, approve: boolean, req: Record<string, unknown>) {
    setActioning(reqId)
    const { data: { user } } = await supabase.auth.getUser()

    if (approve) {
      const updates: Record<string, unknown> = {}
      if (req.requested_name) updates.full_name = req.requested_name
      if (req.requested_avatar_url) updates.avatar_url = req.requested_avatar_url
      if (Object.keys(updates).length > 0) {
        await supabase.from('profiles').update(updates).eq('id', userId)
      }
    }

    await supabase.from('profile_change_requests').update({
      status: approve ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id,
    }).eq('id', reqId)

    setRequests(prev => prev.filter(r => r.id !== reqId))
    setActioning(null)
  }

  const pendingCount = requests.length

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Administration</h1>
        <p className="text-gray-500 mb-6">Manage users, roles, and pending requests</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'users' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Users & Roles
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${tab === 'requests' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Profile Requests
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{pendingCount}</span>
            )}
          </button>
        </div>

        {tab === 'users' && (
          <>
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
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {users.map(user => {
                      const currentRole = pendingRoles[user.id] ?? user.role
                      const hasChange = pendingRoles[user.id] && pendingRoles[user.id] !== user.role
                      return (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-medium text-gray-900">{user.full_name}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                          <td className="px-6 py-4">
                            <select
                              value={currentRole}
                              onChange={e => handleRoleChange(user.id, e.target.value)}
                              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="executive">Executive</option>
                              <option value="assistant_manager">Assistant Manager</option>
                              <option value="manager">Manager</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            {message?.id === user.id ? (
                              <span className={`text-sm font-medium ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</span>
                            ) : hasChange ? (
                              <button onClick={() => saveRole(user.id)} disabled={saving === user.id}
                                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                                {saving === user.id ? 'Saving...' : 'Save'}
                              </button>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-8 bg-blue-50 rounded-xl p-6 border border-blue-100">
              <h3 className="font-semibold text-blue-900 mb-2">Add New Users</h3>
              <p className="text-blue-700 text-sm">
                Go to Supabase Dashboard → Authentication → Users → Invite User.
                Their role defaults to &quot;Assistant Manager&quot; and can be changed here.
              </p>
            </div>
          </>
        )}

        {tab === 'requests' && (
          <div>
            {loadingReqs ? (
              <div className="py-12 text-center text-gray-400">Loading...</div>
            ) : requests.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center text-gray-400">
                No pending profile change requests.
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map(req => {
                  const user = req.user as { full_name?: string; email?: string; avatar_url?: string }
                  return (
                    <div key={req.id as string} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold overflow-hidden">
                            {user.avatar_url ? (
                              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : user.full_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{user.full_name}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(req.created_at as string).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="mt-4 space-y-3">
                        {(req.requested_name as string | null) && (
                          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2.5">
                            <span className="text-xs text-gray-500 w-24">Name change</span>
                            <span className="text-sm text-gray-400 line-through">{user.full_name}</span>
                            <span className="text-gray-400">→</span>
                            <span className="text-sm font-medium text-gray-900">{req.requested_name as string}</span>
                          </div>
                        )}
                        {(req.requested_avatar_url as string | null) && (
                          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2.5">
                            <span className="text-xs text-gray-500 w-24">Profile pic</span>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
                                {user.avatar_url && <img src={user.avatar_url} alt="current" className="w-full h-full object-cover" />}
                              </div>
                              <span className="text-gray-400 text-sm">→</span>
                              <img src={req.requested_avatar_url as string} alt="new" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex gap-3">
                        <button
                          onClick={() => reviewRequest(req.id as string, req.user_id as string, true, req)}
                          disabled={actioning === req.id}
                          className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          {actioning === req.id ? 'Processing...' : '✓ Approve'}
                        </button>
                        <button
                          onClick={() => reviewRequest(req.id as string, req.user_id as string, false, req)}
                          disabled={actioning === req.id}
                          className="bg-white text-red-600 border border-red-200 px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
