'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  review: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  on_hold: 'bg-gray-100 text-gray-800',
}

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
}

export default function AssignmentDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [assignment, setAssignment] = useState<Record<string, unknown> | null>(null)
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([])
  const [observations, setObservations] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: a }, { data: t }, { data: o }] = await Promise.all([
        supabase.from('assignments').select('*, manager:profiles(full_name)').eq('id', id).single(),
        supabase.from('tasks').select('*, assignee:profiles(full_name)').eq('assignment_id', id).order('created_at'),
        supabase.from('observations').select('*, raiser:profiles(full_name)').eq('assignment_id', id).order('created_at', { ascending: false }),
      ])
      setAssignment(a)
      setTasks(t ?? [])
      setObservations(o ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <AppShell><div className="py-12 text-center text-gray-400">Loading...</div></AppShell>
  if (!assignment) return <AppShell><div className="py-12 text-center text-gray-400">Assignment not found</div></AppShell>

  return (
    <AppShell>
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/assignments" className="hover:text-blue-600">Assignments</Link>
          <span>/</span>
          <span className="text-gray-900">{assignment.title as string}</span>
        </div>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{assignment.title as string}</h1>
            <p className="text-gray-500 mt-1">{assignment.client_name as string}</p>
          </div>
          <span className={`text-sm font-medium px-3 py-1.5 rounded-full capitalize ${STATUS_COLORS[assignment.status as string] ?? 'bg-gray-100'}`}>
            {(assignment.status as string).replace('_', ' ')}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Type', value: (assignment.type as string).replace(/_/g, ' ') },
            { label: 'Manager', value: (assignment.manager as { full_name?: string })?.full_name ?? '—' },
            { label: 'Start Date', value: assignment.start_date as string },
            { label: 'Due Date', value: assignment.due_date as string },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wider">{item.label}</p>
              <p className="font-medium text-gray-900 mt-1 capitalize">{item.value}</p>
            </div>
          ))}
        </div>

        {(assignment.description as string | undefined) && (
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
            <p className="text-gray-600">{assignment.description as string}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Tasks ({tasks.length})</h3>
              <Link href={`/tasks/new?assignment=${id}`} className="text-sm text-blue-600 hover:underline">+ Add Task</Link>
            </div>
            {tasks.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No tasks yet</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {tasks.map(t => (
                  <div key={t.id as string} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <Link href={`/tasks/${t.id}`} className="font-medium text-sm text-gray-900 hover:text-blue-600">{t.title as string}</Link>
                      <p className="text-xs text-gray-500">{(t.assignee as { full_name?: string })?.full_name} · Due {t.due_date as string}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status as string] ?? 'bg-gray-100'}`}>
                      {(t.status as string).replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Observations ({observations.length})</h3>
              <Link href={`/observations/new?assignment=${id}`} className="text-sm text-blue-600 hover:underline">+ Add</Link>
            </div>
            {observations.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No observations yet</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {observations.map(o => (
                  <div key={o.id as string} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-gray-900">{o.title as string}</p>
                      <p className="text-xs text-gray-500">{(o.raiser as { full_name?: string })?.full_name}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${RISK_COLORS[o.risk_level as string] ?? 'bg-gray-100'}`}>
                      {o.risk_level as string}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
