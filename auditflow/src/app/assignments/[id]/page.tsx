'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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

const TASK_STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
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
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  const [executives, setExecutives] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)

  // New task inline form
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', assigned_to: '', priority: 'medium', due_date: '' })
  const [savingTask, setSavingTask] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setCurrentProfile(p)
      }
      const [{ data: a }, { data: t }, { data: o }, { data: ex }] = await Promise.all([
        supabase.from('assignments').select('*, manager:profiles!assignments_manager_id_fkey(full_name), assigned_to_profile:profiles!assignments_assigned_to_fkey(full_name)').eq('id', id).single(),
        supabase.from('tasks').select('*, assignee:profiles(full_name)').eq('assignment_id', id).order('created_at'),
        supabase.from('observations').select('*, raiser:profiles(full_name)').eq('assignment_id', id).order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name').eq('role', 'executive'),
      ])
      setAssignment(a)
      setTasks(t ?? [])
      setObservations(o ?? [])
      setExecutives(ex ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  async function addTask() {
    if (!taskForm.title || !taskForm.assigned_to || !taskForm.due_date) return
    setSavingTask(true)
    const { data } = await supabase.from('tasks').insert({
      assignment_id: id,
      title: taskForm.title,
      assigned_to: taskForm.assigned_to,
      priority: taskForm.priority,
      due_date: taskForm.due_date,
      status: 'not_started',
    }).select('*, assignee:profiles(full_name)').single()
    if (data) setTasks(prev => [...prev, data])
    setTaskForm({ title: '', assigned_to: '', priority: 'medium', due_date: '' })
    setShowTaskForm(false)
    setSavingTask(false)
  }

  if (loading) return <AppShell><div className="py-12 text-center text-gray-400">Loading...</div></AppShell>
  if (!assignment) return <AppShell><div className="py-12 text-center text-gray-400">Assignment not found</div></AppShell>

  const isManager = currentProfile?.role === 'manager'
  const isAssistantManager = currentProfile?.role === 'assistant_manager'
  const isExecutive = currentProfile?.role === 'executive'
  const isAssignedAM = isAssistantManager && (assignment.assigned_to as string) === currentProfile?.id
  const canAddTasks = isManager || isAssignedAM || isExecutive

  const assignedToName = (assignment.assigned_to_profile as { full_name?: string } | null)?.full_name
  const managerName = (assignment.manager as { full_name?: string })?.full_name

  // Group tasks by executive
  const tasksByExecutive: Record<string, { name: string; tasks: Record<string, unknown>[] }> = {}
  tasks.forEach(t => {
    const assigneeId = t.assigned_to as string
    const assigneeName = (t.assignee as { full_name?: string })?.full_name ?? 'Unassigned'
    if (!tasksByExecutive[assigneeId]) tasksByExecutive[assigneeId] = { name: assigneeName, tasks: [] }
    tasksByExecutive[assigneeId].tasks.push(t)
  })

  return (
    <AppShell>
      <div>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/assignments" className="hover:text-blue-600">Assignments</Link>
          <span>/</span>
          <span className="text-gray-900">{assignment.title as string}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{assignment.title as string}</h1>
            <p className="text-gray-500 mt-1">{assignment.client_name as string}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium px-3 py-1.5 rounded-full capitalize ${STATUS_COLORS[assignment.status as string] ?? 'bg-gray-100'}`}>
              {(assignment.status as string).replace(/_/g, ' ')}
            </span>
            {isManager && (
              <Link href={`/assignments/${id}/edit`} className="text-sm text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                Edit
              </Link>
            )}
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Type', value: (assignment.type as string).replace(/_/g, ' ') },
            { label: 'Manager', value: managerName ?? '—' },
            { label: 'Assigned To (AM)', value: assignedToName ?? 'Unassigned' },
            { label: 'Due Date', value: assignment.due_date as string },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wider">{item.label}</p>
              <p className="font-medium text-gray-900 mt-1 capitalize">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Assignment Flow — Manager Overview */}
        {isManager && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Assignment Flow Overview</h3>
            <div className="flex items-start gap-4">
              {/* Manager box */}
              <div className="text-center">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto mb-1">
                  {managerName?.[0]?.toUpperCase()}
                </div>
                <p className="text-xs font-medium text-gray-700">{managerName}</p>
                <p className="text-xs text-gray-400">Manager</p>
              </div>
              <div className="flex-1 mt-4 border-t-2 border-dashed border-gray-200 relative">
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 bg-white px-1">assigns to</span>
              </div>
              {/* AM box */}
              <div className="text-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto mb-1 ${assignedToName ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                  {assignedToName ? assignedToName[0].toUpperCase() : '?'}
                </div>
                <p className="text-xs font-medium text-gray-700">{assignedToName ?? 'Not Assigned'}</p>
                <p className="text-xs text-gray-400">Asst. Manager</p>
              </div>
              <div className="flex-1 mt-4 border-t-2 border-dashed border-gray-200 relative">
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 bg-white px-1">tasks to</span>
              </div>
              {/* Executives */}
              <div className="flex gap-2">
                {Object.values(tasksByExecutive).length === 0 ? (
                  <div className="text-center">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 text-sm mx-auto mb-1">?</div>
                    <p className="text-xs text-gray-400">No tasks yet</p>
                  </div>
                ) : Object.values(tasksByExecutive).map(ex => (
                  <div key={ex.name} className="text-center">
                    <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto mb-1">
                      {ex.name[0].toUpperCase()}
                    </div>
                    <p className="text-xs font-medium text-gray-700">{ex.name}</p>
                    <p className="text-xs text-gray-400">Executive · {ex.tasks.length} task{ex.tasks.length !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tasks Section */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Tasks ({tasks.length})</h3>
              {canAddTasks && (
                <button onClick={() => setShowTaskForm(!showTaskForm)}
                  className="text-sm text-blue-600 hover:underline">
                  {showTaskForm ? 'Cancel' : '+ Add Task'}
                </button>
              )}
            </div>

            {/* Inline Add Task Form */}
            {showTaskForm && (
              <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 space-y-3">
                <input
                  placeholder="Task title *"
                  value={taskForm.title}
                  onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={taskForm.assigned_to}
                  onChange={e => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Assign to Executive *</option>
                  {executives.map(ex => <option key={ex.id} value={ex.id}>{ex.full_name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={taskForm.priority}
                    onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button onClick={addTask} disabled={savingTask}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {savingTask ? 'Adding...' : 'Add Task'}
                </button>
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">
                {canAddTasks ? 'No tasks yet. Add one above.' : 'No tasks assigned yet.'}
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {tasks.map(t => (
                  <div key={t.id as string} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <Link href={`/tasks/${t.id}`} className="font-medium text-sm text-gray-900 hover:text-blue-600">
                        {t.title as string}
                      </Link>
                      <p className="text-xs text-gray-500">
                        → {(t.assignee as { full_name?: string })?.full_name} · Due {t.due_date as string}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TASK_STATUS_COLORS[t.status as string] ?? 'bg-gray-100'}`}>
                      {(t.status as string).replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observations */}
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
