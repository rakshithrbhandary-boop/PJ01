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

const OBS_RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const OBS_STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [tasksByAssignment, setTasksByAssignment] = useState<Record<string, Record<string, unknown>[]>>({})
  const [obsByTask, setObsByTask] = useState<Record<string, Record<string, unknown>[]>>({})
  const [loadingTasks, setLoadingTasks] = useState<Record<string, boolean>>({})

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

  async function toggleExpand(assignmentId: string) {
    const isOpen = expanded[assignmentId]
    setExpanded(prev => ({ ...prev, [assignmentId]: !isOpen }))
    if (!isOpen && !tasksByAssignment[assignmentId]) {
      setLoadingTasks(prev => ({ ...prev, [assignmentId]: true }))
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*, assignee:profiles(full_name)')
        .eq('assignment_id', assignmentId)
        .order('created_at')
      const taskList = tasks ?? []
      setTasksByAssignment(prev => ({ ...prev, [assignmentId]: taskList }))

      // Fetch observations for each task
      const taskIds = taskList.map(t => t.id as string)
      if (taskIds.length > 0) {
        const { data: obsData } = await supabase
          .from('observations')
          .select('*')
          .in('task_id', taskIds)
          .order('created_at')
        const grouped: Record<string, Record<string, unknown>[]> = {}
        for (const o of obsData ?? []) {
          const tid = o.task_id as string
          if (!grouped[tid]) grouped[tid] = []
          grouped[tid].push(o)
        }
        setObsByTask(prev => ({ ...prev, ...grouped }))
      }
      setLoadingTasks(prev => ({ ...prev, [assignmentId]: false }))
    }
  }

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
  const colSpan = isManager ? 6 : 5

  return (
    <AppShell>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
            <p className="text-gray-500 mt-1">Manage audit engagements</p>
          </div>
          {isManagerOrAssistant && (
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
                  <th className="w-8 px-3 py-3"></th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Assignment</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Manager</th>
                  {isManager && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const aId = a.id as string
                  const isOpen = expanded[aId] ?? false
                  const tasks = tasksByAssignment[aId] ?? []
                  const isLoadingTasks = loadingTasks[aId]

                  return (
                    <>
                      <tr key={aId} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-4">
                          <button
                            onClick={() => toggleExpand(aId)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors text-gray-400"
                          >
                            <svg
                              className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <Link href={`/assignments/${aId}`} className="font-medium text-gray-900 hover:text-blue-600">
                            {a.title as string}
                          </Link>
                          <p className="text-sm text-gray-500">{a.client_name as string}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{TYPE_LABELS[a.type as string] ?? a.type as string}</td>
                        <td className="px-4 py-4">
                          {isManagerOrAssistant ? (
                            <select
                              value={a.status as string}
                              onChange={e => updateStatus(aId, e.target.value)}
                              disabled={updatingStatus === aId}
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
                        <td className="px-4 py-4 text-sm text-gray-600">{a.due_date as string}</td>
                        <td className="px-4 py-4 text-sm text-gray-600">{(a.manager as { full_name?: string })?.full_name ?? '—'}</td>
                        {isManager && (
                          <td className="px-4 py-4">
                            <div className="flex gap-2">
                              <Link href={`/assignments/${aId}/edit`} className="text-sm text-blue-600 hover:underline font-medium">Edit</Link>
                              <button
                                onClick={() => deleteAssignment(aId, a.title as string)}
                                disabled={deleting === aId}
                                className="text-sm text-red-500 hover:underline font-medium disabled:opacity-50"
                              >
                                {deleting === aId ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {isOpen && (
                        <tr key={`${aId}-tasks`} className="bg-gray-50 border-t border-gray-100">
                          <td></td>
                          <td colSpan={colSpan} className="px-4 py-3">
                            {isLoadingTasks ? (
                              <p className="text-xs text-gray-400 py-2">Loading tasks...</p>
                            ) : tasks.length === 0 ? (
                              <p className="text-xs text-gray-400 py-2">No tasks added yet.</p>
                            ) : (
                              <div className="space-y-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tasks & Observations</p>
                                {tasks.map(t => {
                                  const tId = t.id as string
                                  const taskObs = obsByTask[tId] ?? []
                                  return (
                                    <div key={tId} className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                                      {/* Task row */}
                                      <div className="flex items-center justify-between px-4 py-2.5">
                                        <div className="flex items-center gap-3">
                                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                            t.status === 'completed' ? 'bg-green-400' :
                                            t.status === 'in_progress' ? 'bg-blue-400' :
                                            t.status === 'overdue' ? 'bg-red-400' : 'bg-gray-300'
                                          }`} />
                                          <span className="text-sm font-medium text-gray-800">{t.title as string}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                          <span>→ {(t.assignee as { full_name?: string })?.full_name ?? 'Unassigned'}</span>
                                          <span>Due {t.due_date as string}</span>
                                          <span className={`px-2 py-0.5 rounded-full font-medium ${
                                            t.status === 'completed' ? 'bg-green-100 text-green-700' :
                                            t.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                            t.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                                          }`}>
                                            {(t.status as string).replace(/_/g, ' ')}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Observations under task */}
                                      {taskObs.length > 0 && (
                                        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 space-y-1.5">
                                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Observations</p>
                                          {taskObs.map(o => (
                                            <div key={o.id as string} className="flex items-center justify-between bg-white rounded-md px-3 py-2 border border-gray-100">
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-700 font-medium">{o.title as string}</span>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${OBS_RISK_COLORS[o.risk_level as string] ?? 'bg-gray-100 text-gray-600'}`}>
                                                  {o.risk_level as string}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${OBS_STATUS_COLORS[o.status as string] ?? 'bg-gray-100 text-gray-600'}`}>
                                                  {(o.status as string).replace(/_/g, ' ')}
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  )
}
