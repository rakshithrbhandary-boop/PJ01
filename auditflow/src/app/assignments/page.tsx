'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Assignment } from '@/lib/supabase'

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  review: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  on_hold: 'bg-gray-100 text-gray-800',
}

const TYPE_LABELS: Record<string, string> = {
  internal_audit: 'Internal Audit',
  concurrent_audit: 'Concurrent Audit',
  process_consulting: 'Process Consulting',
  due_diligence: 'Due Diligence',
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    supabase
      .from('assignments')
      .select('*, manager:profiles(full_name)')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAssignments((data as Assignment[]) ?? [])
        setLoading(false)
      })
  }, [])

  const filtered = assignments.filter(a =>
    !filter ||
    a.title.toLowerCase().includes(filter.toLowerCase()) ||
    a.client_name.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <AppShell>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
            <p className="text-gray-500 mt-1">Manage audit engagements</p>
          </div>
          <Link href="/assignments/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
            + New Assignment
          </Link>
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
            <div className="py-12 text-center text-gray-400">
              {filter ? 'No matching assignments' : 'No assignments yet. Create your first one!'}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assignment</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Manager</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link href={`/assignments/${a.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {a.title}
                      </Link>
                      <p className="text-sm text-gray-500">{a.client_name}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{TYPE_LABELS[a.type] ?? a.type}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_COLORS[a.status] ?? 'bg-gray-100'}`}>
                        {a.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{a.due_date}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{(a.manager as { full_name?: string })?.full_name ?? '—'}</td>
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
