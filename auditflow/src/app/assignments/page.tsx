'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  fieldwork: 'bg-indigo-100 text-indigo-800',
  data_collection: 'bg-cyan-100 text-cyan-800',
  analysis: 'bg-purple-100 text-purple-800',
  pending_review: 'bg-orange-100 text-orange-800',
  pending_clarification: 'bg-red-100 text-red-800',
  completed: 'bg-green-100 text-green-800',
  on_hold: 'bg-gray-100 text-gray-800',
}

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  fieldwork: 'Fieldwork',
  data_collection: 'Data Collection',
  analysis: 'Analysis',
  pending_review: 'Pending Review',
  pending_clarification: 'Pending Clarification',
  completed: 'Completed',
  on_hold: 'On Hold',
}

const TYPE_LABELS: Record<string, string> = {
  internal_audit: 'Internal Audit',
  concurrent_audit: 'Concurrent Audit',
  process_consulting: 'Process Consulting',
  due_diligence: 'Due Diligence',
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(p)
      }
      const { data } = await supabase
        .from('assignments')
        .select('*, manager:profiles!assignments_manager_id_fkey(full_name)')
        .order('created_at', { ascending: false })
      setAssignments(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function updateStatus(id: string, status: string) {
    setUpdatingStatus(id)
    await supabase.from('assignments').update({ status }).eq('id', id)
    setAssignments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    setUpdatingStatus(null)
  }

  async function deleteAssignment(id: string, title: string) {
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return
    setDeleting(id)
    await supabase.from('assignments').delete().eq('id', id)
    setAssignments(prev => prev.filter(a => a.id !== id))
    setDeleting(null)
  }

  const isManager = profile?.role === 'manager'
  const isManagerOrAssistant = profile?.role === 'manager' || profile?.role === 'assistant_manager'

  const filtered = assignments.filter(a =>
    !filter ||
    (a.title as string).toLowerCase().includes(filter.toLowerCase()) ||
    (a.client_name as string).toLowerCase().includes(filter.toLowerCase())
  )

  const allStatuses = Object.entries(STATUS_LABELS)

  return (
    <AppShell>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
            <p className="text-gray-500 mt-1">Manage audit engagements</p>
          </div>
          {isManager && (
            <Link href="/assignments/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
              + New Assignment
            </Link>
          )}
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search assignments..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full max-w-sm px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No assignments yet.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assignment</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Manager</th>
                  {isManager && <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(a => (
                  <tr key={a.id as string} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link href={`/assignments/${a.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {a.title as string}
                      </Link>
                      <p className="text-sm text-gray-500">{a.client_name as string}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{TYPE_LABELS[a.type as string] ?? a.type as string}</td>
                    <td className="px-6 py-4">
                      {isManagerOrAssistant ? (
                        <select
                          value={a.status as string}
                          onChange={e => updateStatus(a.id as string, e.target.value)}
                          disabled={updatingStatus === a.id}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[a.status as string] ?? 'bg-gray-100'}`}
                        >
                          {allStatuses.map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[a.status as string] ?? 'bg-gray-100'}`}>
                          {STATUS_LABELS[a.status as string] ?? a.status as string}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{a.due_date as string}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{(a.manager as { full_name?: string })?.full_name ?? '—'}</td>
                    {isManager && (
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Link
                            href={`/assignments/${a.id}/edit`}
                            className="text-sm text-blue-600 hover:underline font-medium"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => deleteAssignment(a.id as string, a.title as string)}
                            disabled={deleting === a.id}
                            className="text-sm text-red-500 hover:underline font-medium disabled:opacity-50"
                          >
                            {deleting === a.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  )
}
