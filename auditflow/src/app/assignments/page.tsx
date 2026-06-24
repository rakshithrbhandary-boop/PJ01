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
  planning: 'Planning', in_progress: 'In Progress', fieldwork: 'Fieldwork',
  data_collection: 'Data Collection', analysis: 'Analysis', pending_review: 'Pending Review',
  pending_clarification: 'Pending Clarification', completed: 'Completed', on_hold: 'On Hold',
}
const OBS_RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
}
const TYPE_LABELS: Record<string, string> = {
  internal_audit: 'Internal Audit', concurrent_audit: 'Concurrent Audit',
  process_consulting: 'Process Consulting', due_diligence: 'Due Diligence',
  investigation: 'Investigation',
}
const AREA_STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
}

interface ProgressData {
  pct: number
  areasPct: number | null
  subAreasPct: number | null
  obsPct: number | null
}

function computeProgress(
  tasks: { parent_id: string | null; status: string }[],
  obs: { status: string }[],
): ProgressData {
  const areas = tasks.filter(t => !t.parent_id)
  const subAreas = tasks.filter(t => !!t.parent_id)

  const areasPct = areas.length > 0 ? (areas.filter(t => t.status === 'completed').length / areas.length) * 100 : null
  const subAreasPct = subAreas.length > 0 ? (subAreas.filter(t => t.status === 'completed').length / subAreas.length) * 100 : null
  const obsPct = obs.length > 0 ? (obs.filter(o => o.status !== 'open').length / obs.length) * 100 : null

  const parts = [areasPct, subAreasPct, obsPct].filter(v => v !== null) as number[]
  const pct = parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0

  return { pct, areasPct, subAreasPct, obsPct }
}

function rowBorderClass(dueDate: string | null | undefined, status: string): string {
  if (status === 'completed') return 'border-l-4 border-l-green-400'
  if (!dueDate) return ''
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'border-l-4 border-l-red-500'
  if (days <= 7) return 'border-l-4 border-l-orange-400'
  if (days <= 30) return 'border-l-4 border-l-yellow-400'
  return ''
}

function dueDateClass(dueDate: string | null | undefined, status: string): string {
  if (status === 'completed') return 'text-green-600'
  if (!dueDate) return 'text-gray-400'
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'text-red-600 font-semibold'
  if (days <= 7) return 'text-orange-500 font-semibold'
  if (days <= 30) return 'text-yellow-600'
  return 'text-gray-600'
}

function ProgressBar({ pct, status }: { pct: number; status: string }) {
  const barColor =
    status === 'completed' ? 'bg-green-500' :
    pct >= 67 ? 'bg-blue-500' :
    pct >= 34 ? 'bg-amber-400' :
    'bg-red-400'

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium ${barColor.replace('bg-', 'text-')}`}>{pct}%</span>
    </div>
  )
}

interface OverviewData {
  areas: Record<string, unknown>[]
  observations: Record<string, unknown>[]
  executives: { id: string; full_name: string }[]
  currentAM: string | null
  handovers: Record<string, unknown>[]
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function DueBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-gray-400 text-xs">No due date</span>
  if (days < 0) return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">{Math.abs(days)}d overdue</span>
  if (days === 0) return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Due today</span>
  if (days <= 7) return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">{days}d left</span>
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{days}d left</span>
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [overviewByAssignment, setOverviewByAssignment] = useState<Record<string, OverviewData>>({})
  const [loadingOverview, setLoadingOverview] = useState<Record<string, boolean>>({})
  const [progressByAssignment, setProgressByAssignment] = useState<Record<string, ProgressData>>({})
  const [currentAMByAssignment, setCurrentAMByAssignment] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)

      let assignmentsData: Record<string, unknown>[] = []

      if (p?.role === 'manager') {
        const { data } = await supabase
          .from('assignments')
          .select('*, manager:profiles!assignments_manager_id_fkey(full_name), assigned_to_profile:profiles!assignments_assigned_to_fkey(full_name)')
          .eq('manager_id', user.id)
          .order('created_at', { ascending: false })
        assignmentsData = data ?? []

      } else if (p?.role === 'assistant_manager') {
        const [{ data: direct }, { data: handoverRows }] = await Promise.all([
          supabase.from('assignments')
            .select('*, manager:profiles!assignments_manager_id_fkey(full_name)')
            .eq('assigned_to', user.id)
            .order('created_at', { ascending: false }),
          supabase.from('assignment_handovers')
            .select('assignment_id')
            .or(`from_am_id.eq.${user.id},to_am_id.eq.${user.id}`),
        ])
        const handoverAssignmentIds = [...new Set((handoverRows ?? []).map(h => h.assignment_id as string))]
        const directIds = (direct ?? []).map(a => a.id as string)
        const missing = handoverAssignmentIds.filter(id => !directIds.includes(id))
        let extra: Record<string, unknown>[] = []
        if (missing.length > 0) {
          const { data: extraData } = await supabase
            .from('assignments')
            .select('*, manager:profiles!assignments_manager_id_fkey(full_name)')
            .in('id', missing)
          extra = extraData ?? []
        }
        assignmentsData = [...(direct ?? []), ...extra]

      } else if (p?.role === 'executive') {
        const { data: myTasks } = await supabase.from('tasks').select('assignment_id').eq('assigned_to', user.id)
        const assignmentIds = [...new Set((myTasks ?? []).map(t => t.assignment_id as string))]
        if (assignmentIds.length > 0) {
          const { data } = await supabase
            .from('assignments')
            .select('*, manager:profiles!assignments_manager_id_fkey(full_name)')
            .in('id', assignmentIds)
            .order('created_at', { ascending: false })
          assignmentsData = data ?? []
        }
      }

      setAssignments(assignmentsData)

      // Bulk fetch tasks, observations, and handovers for progress + current AM
      const allIds = assignmentsData.map(a => a.id as string)
      if (allIds.length > 0) {
        const [{ data: allTasks }, { data: allObs }, { data: allHandovers }] = await Promise.all([
          supabase.from('tasks').select('assignment_id, parent_id, status').in('assignment_id', allIds),
          supabase.from('observations').select('assignment_id, status').in('assignment_id', allIds),
          supabase.from('assignment_handovers').select('assignment_id, to_am_name, created_at').in('assignment_id', allIds).order('created_at'),
        ])
        const progressMap: Record<string, ProgressData> = {}
        const amMap: Record<string, string> = {}
        for (const aId of allIds) {
          const tasks = (allTasks ?? []).filter(t => t.assignment_id === aId)
          const obs = (allObs ?? []).filter(o => o.assignment_id === aId)
          progressMap[aId] = computeProgress(tasks, obs)
          // Last handover's to_am_name = current AM; fall back to assigned_to_profile
          const handoversForA = (allHandovers ?? []).filter(h => h.assignment_id === aId)
          if (handoversForA.length > 0) {
            amMap[aId] = handoversForA[handoversForA.length - 1].to_am_name
          } else {
            const asgn = assignmentsData.find(a => a.id === aId)
            amMap[aId] = (asgn?.assigned_to_profile as { full_name?: string } | null)?.full_name ?? '—'
          }
        }
        setProgressByAssignment(progressMap)
        setCurrentAMByAssignment(amMap)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function toggleExpand(assignmentId: string) {
    const isOpen = expanded[assignmentId]
    setExpanded(prev => ({ ...prev, [assignmentId]: !isOpen }))
    if (!isOpen && !overviewByAssignment[assignmentId]) {
      setLoadingOverview(prev => ({ ...prev, [assignmentId]: true }))

      const [
        { data: areasRaw },
        { data: obsRaw },
        { data: handovers },
      ] = await Promise.all([
        supabase.from('tasks').select('*').eq('assignment_id', assignmentId).order('created_at'),
        supabase.from('observations').select('*').eq('assignment_id', assignmentId).order('created_at'),
        supabase.from('assignment_handovers').select('*').eq('assignment_id', assignmentId).order('created_at'),
      ])

      const areas = areasRaw ?? []
      const topLevel = areas.filter(t => !t.parent_id)
      const children = areas.filter(t => t.parent_id)

      // Resolve executive names for areas
      const execIds = [...new Set(areas.map(t => t.assigned_to as string).filter(Boolean))]
      const { data: execProfiles } = execIds.length > 0
        ? await supabase.from('profiles').select('id, full_name').in('id', execIds)
        : { data: [] }
      const nameMap = Object.fromEntries((execProfiles ?? []).map(p => [p.id, p.full_name]))

      const areasWithNames = topLevel.map(area => {
        const subs = children.filter(c => c.parent_id === area.id)
        return {
          ...area,
          assignee_name: nameMap[area.assigned_to as string] ?? null,
          sub_count: subs.length,
          sub_completed: subs.filter(s => s.status === 'completed').length,
        }
      })

      // Unique executives across all areas
      const executives = (execProfiles ?? []).map(p => ({ id: p.id, full_name: p.full_name }))

      // Derive current AM from handover history
      const sortedHandovers = (handovers ?? []).sort(
        (a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
      )
      const lastHandover = sortedHandovers.length > 0 ? sortedHandovers[sortedHandovers.length - 1] : null
      let currentAM: string | null = null
      if (lastHandover) {
        const { data: amProfile } = await supabase
          .from('profiles').select('full_name').eq('id', lastHandover.to_am_id).single()
        currentAM = amProfile?.full_name ?? null
      }

      setOverviewByAssignment(prev => ({
        ...prev,
        [assignmentId]: {
          areas: areasWithNames as Record<string, unknown>[],
          observations: obsRaw ?? [],
          executives,
          currentAM,
          handovers: sortedHandovers,
        },
      }))
      setLoadingOverview(prev => ({ ...prev, [assignmentId]: false }))
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
  const allStatuses = Object.entries(STATUS_LABELS)
  const colSpan = isManager ? 6 : 5

  const filtered = assignments.filter(a =>
    !filter ||
    (a.title as string).toLowerCase().includes(filter.toLowerCase()) ||
    (a.client_name as string)?.toLowerCase().includes(filter.toLowerCase()) ||
    (a.code as string)?.toLowerCase().includes(filter.toLowerCase())
  )

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
          <input type="text" placeholder="Search by title, client or code..."
            value={filter} onChange={e => setFilter(e.target.value)}
            className="w-full max-w-sm px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No assignments found.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-8 px-3 py-3" />
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Assignment</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{isManager ? 'Current AM' : 'Manager'}</th>
                  {isManager && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const aId = a.id as string
                  const isOpen = expanded[aId] ?? false
                  const overview = overviewByAssignment[aId]
                  const isLoadingOv = loadingOverview[aId]
                  const days = daysUntil(a.due_date as string)
                  const progress = progressByAssignment[aId]
                  const aStatus = a.status as string

                  return (
                    <>
                      <tr key={aId} className={`border-t border-gray-50 hover:bg-gray-50 ${rowBorderClass(a.due_date as string, aStatus)}`}>
                        <td className="px-3 py-4">
                          <button onClick={() => toggleExpand(aId)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors text-gray-400">
                            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Link href={`/assignments/${aId}`} className="font-medium text-gray-900 hover:text-blue-600">
                              {a.title as string}
                            </Link>
                            {(a.code as string) && (
                              <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100">
                                {a.code as string}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{a.client_name as string}</p>
                          {progress !== undefined && (
                            <ProgressBar pct={aStatus === 'completed' ? 100 : progress.pct} status={aStatus} />
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{TYPE_LABELS[a.type as string] ?? a.type as string}</td>
                        <td className="px-4 py-4">
                          {isManagerOrAssistant ? (
                            <select value={a.status as string} onChange={e => updateStatus(aId, e.target.value)}
                              disabled={updatingStatus === aId}
                              className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[a.status as string] ?? 'bg-gray-100'}`}>
                              {allStatuses.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                            </select>
                          ) : (
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[a.status as string] ?? 'bg-gray-100'}`}>
                              {STATUS_LABELS[a.status as string] ?? a.status as string}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-4 text-sm ${dueDateClass(a.due_date as string, aStatus)}`}>{(a.due_date as string) || '—'}</td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {isManager
                            ? (currentAMByAssignment[aId] ?? '—')
                            : ((a.manager as { full_name?: string })?.full_name ?? '—')}
                        </td>
                        {isManager && (
                          <td className="px-4 py-4">
                            <div className="flex gap-2">
                              <Link href={`/assignments/${aId}/edit`} className="text-sm text-blue-600 hover:underline font-medium">Edit</Link>
                              <button onClick={() => deleteAssignment(aId, a.title as string)} disabled={deleting === aId}
                                className="text-sm text-red-500 hover:underline font-medium disabled:opacity-50">
                                {deleting === aId ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {isOpen && (
                        <tr key={`${aId}-overview`} className="bg-slate-50 border-t border-gray-100">
                          <td />
                          <td colSpan={colSpan} className="px-5 py-5">
                            {isLoadingOv ? (
                              <p className="text-xs text-gray-400 py-2">Loading overview...</p>
                            ) : !overview ? null : (
                              <AssignmentOverview
                                assignment={a}
                                overview={overview}
                                days={days}
                              />
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

function AssignmentOverview({
  assignment,
  overview,
  days,
}: {
  assignment: Record<string, unknown>
  overview: OverviewData
  days: number | null
}) {
  const { areas, observations, executives, currentAM, handovers } = overview
  const aId = assignment.id as string

  // Area stats
  const totalAreas = areas.length
  const completedAreas = areas.filter(a => a.status === 'completed').length
  const areaProgress = totalAreas > 0 ? Math.round((completedAreas / totalAreas) * 100) : 0

  // Observation stats
  const obsOpen = observations.filter(o => o.status === 'open').length
  const obsClosed = observations.filter(o => o.status !== 'open').length
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const o of observations) {
    const r = o.risk_level as string
    if (r in riskCounts) riskCounts[r as keyof typeof riskCounts]++
  }

  const top3Obs = observations.slice(0, 3)

  return (
    <div className="space-y-5">

      {/* Progress cards */}
      <div className="grid grid-cols-4 gap-3">
        {/* Areas progress */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Areas of Audit</p>
          <p className="text-2xl font-bold text-gray-800">{completedAreas}<span className="text-base font-medium text-gray-400"> / {totalAreas}</span></p>
          <p className="text-xs text-gray-500 mb-2">completed</p>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${areaProgress}%` }} />
          </div>
        </div>

        {/* Observations */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Observations</p>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-2xl font-bold text-red-600">{obsOpen}</span>
            <span className="text-sm text-gray-400 mb-0.5">open</span>
            <span className="text-xl font-bold text-green-600 ml-1">{obsClosed}</span>
            <span className="text-sm text-gray-400 mb-0.5">closed</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {riskCounts.critical > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{riskCounts.critical} Critical</span>}
            {riskCounts.high > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{riskCounts.high} High</span>}
            {riskCounts.medium > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">{riskCounts.medium} Medium</span>}
            {riskCounts.low > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{riskCounts.low} Low</span>}
            {observations.length === 0 && <span className="text-xs text-gray-400">No observations</span>}
          </div>
        </div>

        {/* Team */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Team</p>
          {currentAM && (
            <div className="mb-2">
              <p className="text-xs text-gray-400">Current AM</p>
              <p className="text-sm font-semibold text-gray-800">{currentAM}</p>
            </div>
          )}
          {executives.length > 0 ? (
            <div>
              <p className="text-xs text-gray-400 mb-1">Executives</p>
              <div className="flex flex-wrap gap-1">
                {executives.slice(0, 4).map(e => (
                  <span key={e.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{e.full_name.split(' ')[0]}</span>
                ))}
                {executives.length > 4 && <span className="text-xs text-gray-400">+{executives.length - 4} more</span>}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">No executives assigned</p>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Timeline</p>
          <div className="mb-2">
            <DueBadge days={days} />
          </div>
          {(assignment.due_date as string | null) && (
            <p className="text-xs text-gray-500">Due: {assignment.due_date as string}</p>
          )}
          {(assignment.start_date as string | null) && (
            <p className="text-xs text-gray-500 mt-1">Started: {assignment.start_date as string}</p>
          )}
        </div>
      </div>

      {/* Assignment movement history */}
      {handovers.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-amber-100 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Assignment Movement History</p>
          </div>
          <div className="px-4 py-3">
            <div className="relative">
              {/* Vertical line */}
              {handovers.length > 1 && (
                <div className="absolute left-[7px] top-3 bottom-3 w-px bg-amber-200" />
              )}
              <div className="space-y-3">
                {handovers.map((h, i) => {
                  const type = h.handover_type as string
                  const isReturn = type === 'return'
                  const isLast = i === handovers.length - 1
                  const dateStr = h.created_at
                    ? new Date(h.created_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : ''
                  return (
                    <div key={h.id as string} className="flex items-start gap-3 relative">
                      <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 mt-0.5 border-2 z-10 ${
                        isReturn ? 'bg-green-400 border-green-500' :
                        type === 'permanent' ? 'bg-red-400 border-red-500' :
                        'bg-amber-400 border-amber-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-800">{h.from_am_name as string}</span>
                          <span className="text-gray-400 text-xs">→</span>
                          <span className={`text-xs font-semibold ${isLast ? 'text-indigo-700' : 'text-gray-800'}`}>{h.to_am_name as string}</span>
                          {isLast && <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">Current</span>}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${
                            isReturn ? 'bg-green-100 text-green-700' :
                            type === 'permanent' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>{isReturn ? 'Return' : type}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-400">{dateStr}</span>
                          {(h.return_date as string) && <span className="text-xs text-gray-400">· Returns {h.return_date as string}</span>}
                          {(h.reason as string) && <span className="text-xs text-gray-500 italic">"{h.reason as string}"</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        {/* Areas table */}
        <div className="col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Areas of Audit</p>
          </div>
          {areas.length === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-3">No areas added yet.</p>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Area</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Assigned To</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Sub-areas</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {areas.map(area => (
                  <tr key={area.id as string} className="border-t border-gray-50">
                    <td className="px-4 py-2.5 text-sm text-gray-800">{area.title as string}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{(area.assignee_name as string) ?? 'Unassigned'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {(area.sub_count as number) > 0
                        ? `${area.sub_completed as number}/${area.sub_count as number} done`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${AREA_STATUS_COLORS[area.status as string] ?? 'bg-gray-100 text-gray-600'}`}>
                        {(area.status as string)?.replace(/_/g, ' ') ?? 'not started'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent observations */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Observations</p>
            {observations.length > 3 && (
              <Link href={`/observations?assignment=${aId}`} className="text-xs text-blue-600 hover:underline">View all →</Link>
            )}
          </div>
          {observations.length === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-3">No observations raised.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {top3Obs.map(o => (
                <Link key={o.id as string} href={`/observations/${o.id}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors group">
                  <span className="text-sm text-gray-800 group-hover:text-blue-600 truncate flex-1 mr-2">{o.title as string}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${OBS_RISK_COLORS[o.risk_level as string] ?? 'bg-gray-100 text-gray-600'}`}>
                      {o.risk_level as string}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${
                      (o.status as string) === 'open' ? 'bg-red-100 text-red-700' :
                      (o.status as string) === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>{(o.status as string)?.replace(/_/g, ' ')}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Open assignment button */}
      <div className="flex justify-end pt-1">
        <Link href={`/assignments/${aId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
          Open Assignment
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
