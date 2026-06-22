'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'

const STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
}
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-green-600',
  medium: 'text-yellow-600',
  high: 'text-red-600',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    let query = supabase.from('tasks').select('*, assignee:profiles(full_name), assignment:assignments(title)').order('due_date')
    if (statusFilter) query = query.eq('status', statusFilter)
    query.then(({ data }) => {
      setTasks(data ?? [])
      setLoading(false)
    })
  }, [statusFilter])

  return (
    <AppShell>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
            <p className="text-gray-500 mt-1">Track all tasks across assignments</p>
          </div>
          <Link href="/tasks/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
            + New Task
          </Link>
        </div>

        <div className="mb-4 flex gap-2">
          {['', 'not_started', 'in_progress', 'completed', 'overdue'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s === '' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : tasks.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No tasks found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Task</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assignment</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assignee</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tasks.map(t => (
                  <tr key={t.id as string} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link href={`/tasks/${t.id}`} className="font-medium text-gray-900 hover:text-blue-600">{t.title as string}</Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{(t.assignment as { title?: string })?.title ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{(t.assignee as { full_name?: string })?.full_name ?? '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-medium capitalize ${PRIORITY_COLORS[t.priority as string] ?? ''}`}>
                        {t.priority as string}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t.due_date as string}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_COLORS[t.status as string] ?? 'bg-gray-100'}`}>
                        {(t.status as string).replace('_', ' ')}
                      </span>
                    </td>
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
