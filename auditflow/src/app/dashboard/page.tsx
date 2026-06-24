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
const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700', low: 'bg-green-100 text-green-700',
}
const ACTIVE_STATUSES = ['planning', 'in_progress', 'fieldwork', 'data_collection', 'analysis', 'pending_review', 'pending_clarification']
const PIPELINE_STAGES = ['planning', 'in_progress', 'fieldwork', 'data_collection', 'analysis', 'pending_review', 'pending_clarification', 'on_hold', 'completed']

function daysUntil(d: string | null): number | null {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

function computeProgress(areas: { parent_id: string | null; status: string }[], obs: { status: string }[]) {
  const top = areas.filter(t => !t.parent_id)
  const sub = areas.filter(t => !!t.parent_id)
  const aP = top.length > 0 ? (top.filter(t => t.status === 'completed').length / top.length) * 100 : null
  const sP = sub.length > 0 ? (sub.filter(t => t.status === 'completed').length / sub.length) * 100 : null
  const oP = obs.length > 0 ? (obs.filter(o => o.status !== 'open').length / obs.length) * 100 : null
  const parts = [aP, sP, oP].filter(v => v !== null) as number[]
  return parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0
}

function StatCard({
  label, value, sub, color, icon, href,
}: { label: string; value: number | string; sub?: string; color: string; icon: string; href?: string }) {
  const inner = (
    <div className={`bg-white rounded-xl p-5 shadow-sm border border-gray-100 h-full ${href ? 'hover:border-blue-200 hover:shadow-md transition-all cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <span className="text-xl">{icon}</span>
      </div>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
  return href ? <Link href={href} className="block">{inner}</Link> : inner
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 67 ? 'bg-blue-500' : pct >= 34 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold w-8 text-right ${color.replace('bg-', 'text-')}`}>{pct}%</span>
    </div>
  )
}

type Assignment = Record<string, unknown>
type Task = { id: string; assignment_id: string; parent_id: string | null; status: string; title: string; due_date: string | null; assigned_to: string | null }
type Obs = { id: string; assignment_id: string; title: string; risk_level: string; status: string; task_id: string | null }
type Handover = { id: string; assignment_id: string; to_am_id: string; to_am_name: string; from_am_name: string; created_at: string }
type ReturnReq = { id: string; assignment_id: string; requested_by_name: string; status: string }

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Raw data
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [observations, setObservations] = useState<Obs[]>([])
  const [handovers, setHandovers] = useState<Handover[]>([])
  const [returnReqs, setReturnReqs] = useState<ReturnReq[]>([])
  const [amProfiles, setAmProfiles] = useState<{ id: string; full_name: string }[]>([])
  const [execProfiles, setExecProfiles] = useState<{ id: string; full_name: string }[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)

      // Fetch assignments scoped to role
      let assignmentsData: Assignment[] = []
      if (p?.role === 'manager') {
        const { data } = await supabase.from('assignments')
          .select('*, manager:profiles!assignments_manager_id_fkey(full_name), assigned_to_profile:profiles!assignments_assigned_to_fkey(full_name)')
          .eq('manager_id', user.id).order('created_at', { ascending: false })
        assignmentsData = data ?? []
      } else if (p?.role === 'assistant_manager') {
        const [{ data: direct }, { data: hRows }] = await Promise.all([
          supabase.from('assignments').select('*, manager:profiles!assignments_manager_id_fkey(full_name)').eq('assigned_to', user.id),
          supabase.from('assignment_handovers').select('assignment_id').or(`from_am_id.eq.${user.id},to_am_id.eq.${user.id}`),
        ])
        const extra_ids = [...new Set((hRows ?? []).map(h => h.assignment_id as string))].filter(id => !(direct ?? []).find(a => a.id === id))
        let extra: Assignment[] = []
        if (extra_ids.length > 0) {
          const { data } = await supabase.from('assignments').select('*, manager:profiles!assignments_manager_id_fkey(full_name)').in('id', extra_ids)
          extra = data ?? []
        }
        assignmentsData = [...(direct ?? []), ...extra]
      } else if (p?.role === 'executive') {
        const { data: myT } = await supabase.from('tasks').select('assignment_id').eq('assigned_to', user.id)
        const ids = [...new Set((myT ?? []).map(t => t.assignment_id as string))]
        if (ids.length > 0) {
          const { data } = await supabase.from('assignments').select('*, manager:profiles!assignments_manager_id_fkey(full_name)').in('id', ids)
          assignmentsData = data ?? []
        }
      }

      setAssignments(assignmentsData)
      const allIds = assignmentsData.map(a => a.id as string)

      if (allIds.length > 0) {
        const [
          { data: tData }, { data: oData }, { data: hData }, { data: rData },
          { data: amData }, { data: exData },
        ] = await Promise.all([
          supabase.from('tasks').select('id, assignment_id, parent_id, status, title, due_date, assigned_to').in('assignment_id', allIds),
          supabase.from('observations').select('id, assignment_id, title, risk_level, status, task_id').in('assignment_id', allIds),
          supabase.from('assignment_handovers').select('*').in('assignment_id', allIds).order('created_at'),
          supabase.from('assignment_return_requests').select('id, assignment_id, requested_by_name, status').in('assignment_id', allIds).eq('status', 'pending'),
          supabase.from('profiles').select('id, full_name').eq('role', 'assistant_manager'),
          supabase.from('profiles').select('id, full_name').eq('role', 'executive'),
        ])
        setTasks((tData ?? []) as Task[])
        setObservations((oData ?? []) as Obs[])
        setHandovers((hData ?? []) as Handover[])
        setReturnReqs((rData ?? []) as ReturnReq[])
        setAmProfiles(amData ?? [])
        setExecProfiles(exData ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <AppShell><div className="py-20 text-center text-gray-400">Loading dashboard...</div></AppShell>

  const isManager = profile?.role === 'manager'
  const isAM = profile?.role === 'assistant_manager'

  // ── Derived computations ──────────────────────────────────────────────────

  // Current AM per assignment (from last handover or assigned_to_profile)
  const currentAMMap: Record<string, string> = {}
  for (const a of assignments) {
    const aId = a.id as string
    const aHandovers = handovers.filter(h => h.assignment_id === aId)
    if (aHandovers.length > 0) {
      currentAMMap[aId] = aHandovers[aHandovers.length - 1].to_am_name
    } else {
      currentAMMap[aId] = (a.assigned_to_profile as { full_name?: string } | null)?.full_name ?? '—'
    }
  }

  // Progress per assignment
  const progressMap: Record<string, number> = {}
  for (const a of assignments) {
    const aId = a.id as string
    const t = tasks.filter(t => t.assignment_id === aId)
    const o = observations.filter(o => o.assignment_id === aId)
    progressMap[aId] = a.status === 'completed' ? 100 : computeProgress(t, o)
  }

  // Stat card values
  const totalAssignments = assignments.length
  const activeAssignments = assignments.filter(a => ACTIVE_STATUSES.includes(a.status as string)).length
  const completedAssignments = assignments.filter(a => a.status === 'completed').length
  const onHoldAssignments = assignments.filter(a => a.status === 'on_hold').length

  const unassignedAssignments = assignments.filter(a => {
    const aId = a.id as string
    const aHandovers = handovers.filter(h => h.assignment_id === aId)
    return !a.assigned_to && aHandovers.length === 0
  })

  const nearDeadline = assignments.filter(a => {
    const d = daysUntil(a.due_date as string)
    return d !== null && d >= 0 && d <= 7 && a.status !== 'completed'
  })

  const openCriticalHigh = observations.filter(o => o.status === 'open' && (o.risk_level === 'critical' || o.risk_level === 'high'))
  const openObs = observations.filter(o => o.status === 'open')
  const pendingReturns = returnReqs.filter(r => r.status === 'pending')

  const today = new Date().toISOString().split('T')[0]
  const overdueSubAreas = tasks.filter(t => t.parent_id && t.status !== 'completed' && t.due_date && t.due_date < today)

  // Assignment health table — sorted by risk (overdue first, then low progress, then critical obs)
  const assignmentHealth = assignments
    .filter(a => a.status !== 'completed')
    .map(a => {
      const aId = a.id as string
      const d = daysUntil(a.due_date as string)
      const pct = progressMap[aId] ?? 0
      const critObs = observations.filter(o => o.assignment_id === aId && o.status === 'open' && o.risk_level === 'critical').length
      const openObsCount = observations.filter(o => o.assignment_id === aId && o.status === 'open').length
      const riskScore = (d !== null && d < 0 ? 100 : 0) + (critObs * 30) + Math.max(0, 100 - pct)
      return { a, aId, d, pct, critObs, openObsCount, riskScore }
    })
    .sort((x, y) => y.riskScore - x.riskScore)

  // Least progress assignment (non-completed, with some data)
  const leastProgress = [...assignments]
    .filter(a => a.status !== 'completed')
    .map(a => ({ a, pct: progressMap[a.id as string] ?? 0 }))
    .sort((x, y) => x.pct - y.pct)[0]

  // Pipeline stage counts
  const stageCounts = PIPELINE_STAGES.map(s => ({
    label: STATUS_LABELS[s] ?? s,
    count: assignments.filter(a => a.status === s).length,
    color: STATUS_COLORS[s] ?? 'bg-gray-100',
  })).filter(s => s.count > 0)

  // Per-AM stats
  const amStats = amProfiles.map(am => {
    const amAssignments = assignments.filter(a => currentAMMap[a.id as string] === am.full_name)
    const amTasks = tasks.filter(t => amAssignments.some(a => a.id === t.assignment_id))
    const overdueCount = amTasks.filter(t => t.parent_id && t.status !== 'completed' && t.due_date && t.due_date < today).length
    const avgProgress = amAssignments.length > 0
      ? Math.round(amAssignments.reduce((s, a) => s + (progressMap[a.id as string] ?? 0), 0) / amAssignments.length)
      : 0
    return { am, count: amAssignments.length, avgProgress, overdueCount }
  }).filter(x => x.count > 0)

  // Per-executive stats
  const execStats = execProfiles.map(ex => {
    const exAreas = tasks.filter(t => !t.parent_id && t.assigned_to === ex.id)
    const exSubs = tasks.filter(t => !!t.parent_id && t.assigned_to === ex.id)
    const completedSubs = exSubs.filter(t => t.status === 'completed').length
    const overdueCount = [...exAreas, ...exSubs].filter(t => t.status !== 'completed' && t.due_date && t.due_date < today).length
    return { ex, areas: exAreas.length, subs: exSubs.length, completedSubs, overdueCount }
  }).filter(x => x.areas + x.subs > 0)

  // Risk breakdown for observations
  const riskBreakdown = ['critical', 'high', 'medium', 'low'].map(r => ({
    label: r, open: observations.filter(o => o.risk_level === r && o.status === 'open').length,
    total: observations.filter(o => o.risk_level === r).length,
  }))

  // Recent activity — combine handovers + return requests sorted by date
  const recentActivity = [
    ...handovers.map(h => ({
      key: h.id, type: 'handover' as const,
      text: `${h.from_am_name} handed over to ${h.to_am_name}`,
      date: h.created_at,
      assignmentId: h.assignment_id,
    })),
    ...returnReqs.map(r => ({
      key: r.id, type: 'return' as const,
      text: `${r.requested_by_name} requested return`,
      date: '',
      assignmentId: r.assignment_id,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">
            {isManager ? 'Manager overview — all assignments under your watch' :
             isAM ? 'Your assignments and workload' : 'Your audit areas and tasks'}
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total Assignments" icon="📋"
            value={totalAssignments}
            sub={`${activeAssignments} active · ${completedAssignments} completed · ${onHoldAssignments} on hold`}
            color="text-gray-900" />
          <StatCard label="Unassigned Assignments" icon="⚠️"
            value={unassignedAssignments.length}
            sub={unassignedAssignments.length > 0 ? "Need an AM assigned" : "All assignments have an AM"}
            color={unassignedAssignments.length > 0 ? "text-red-600" : "text-green-600"}
            href="/assignments" />
          <StatCard label="Near Deadline" icon="⏰"
            value={nearDeadline.length}
            sub="Due within 7 days"
            color={nearDeadline.length > 0 ? "text-orange-600" : "text-gray-400"} />
          <StatCard label="Open Critical & High Obs" icon="🚨"
            value={openCriticalHigh.length}
            sub={`${openObs.length} total open observations`}
            color={openCriticalHigh.length > 0 ? "text-red-600" : "text-green-600"}
            href="/observations" />
          <StatCard label="Overdue Sub-areas" icon="📌"
            value={overdueSubAreas.length}
            sub="Sub-areas past due date"
            color={overdueSubAreas.length > 0 ? "text-red-600" : "text-green-600"} />
          <StatCard label="Pending Return Requests" icon="↩️"
            value={pendingReturns.length}
            sub={pendingReturns.length > 0 ? "AMs awaiting reassignment" : "No pending requests"}
            color={pendingReturns.length > 0 ? "text-orange-600" : "text-gray-400"} />
        </div>

        {/* Pipeline */}
        {stageCounts.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Assignment Pipeline</h2>
            <div className="flex items-end gap-3 flex-wrap">
              {stageCounts.map(s => (
                <div key={s.label} className="flex flex-col items-center gap-1">
                  <span className="text-lg font-bold text-gray-800">{s.count}</span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${s.color}`}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assignment Health Table */}
        {assignmentHealth.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Assignment Health</h2>
              <p className="text-xs text-gray-400 mt-0.5">Sorted by risk — overdue + low progress + open critical observations first</p>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Assignment</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Current AM</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase w-40">Progress</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Due</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Open Obs</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {assignmentHealth.map(({ a, aId, d, pct, critObs, openObsCount }) => (
                  <tr key={aId} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-900">{a.title as string}</p>
                      <p className="text-xs text-gray-400">{a.client_name as string}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{currentAMMap[aId] ?? '—'}</td>
                    <td className="px-4 py-3 w-40"><ProgressBar pct={pct} /></td>
                    <td className="px-4 py-3">
                      {d === null ? <span className="text-xs text-gray-400">—</span>
                        : d < 0 ? <span className="text-xs font-semibold text-red-600">{Math.abs(d)}d overdue</span>
                        : d <= 7 ? <span className="text-xs font-semibold text-orange-500">{d}d left</span>
                        : <span className="text-xs text-gray-500">{d}d left</span>}
                    </td>
                    <td className="px-4 py-3">
                      {openObsCount > 0 ? (
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-semibold text-gray-800">{openObsCount}</span>
                          {critObs > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{critObs} critical</span>}
                        </div>
                      ) : <span className="text-xs text-gray-400">None</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[a.status as string] ?? 'bg-gray-100'}`}>
                        {STATUS_LABELS[a.status as string] ?? a.status as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/assignments/${aId}`} className="text-xs text-blue-600 hover:underline font-medium">Open →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Overdue Sub-areas */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Overdue Sub-areas</h2>
              <p className="text-xs text-gray-400 mt-0.5">Sub-areas past their due date</p>
            </div>
            {overdueSubAreas.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">No overdue sub-areas</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {overdueSubAreas.slice(0, 6).map(t => {
                  const days = daysUntil(t.due_date)
                  const execName = execProfiles.find(e => e.id === t.assigned_to)?.full_name ?? '—'
                  const asgn = assignments.find(a => a.id === t.assignment_id)
                  return (
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{t.title}</p>
                        <p className="text-xs text-gray-400">{asgn?.title as string ?? '—'} · {execName}</p>
                      </div>
                      <span className="text-xs font-semibold text-red-600">{days !== null ? `${Math.abs(days)}d ago` : '—'}</span>
                    </div>
                  )
                })}
                {overdueSubAreas.length > 6 && (
                  <p className="px-5 py-2 text-xs text-gray-400">+{overdueSubAreas.length - 6} more</p>
                )}
              </div>
            )}
          </div>

          {/* Open Critical + High Observations */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Critical & High Observations</h2>
              <p className="text-xs text-gray-400 mt-0.5">Unresolved observations needing attention</p>
            </div>
            {openCriticalHigh.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">No critical or high observations open</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {openCriticalHigh.slice(0, 6).map(o => {
                  const asgn = assignments.find(a => a.id === o.assignment_id)
                  return (
                    <Link key={o.id} href={`/observations/${o.id}`}
                      className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 group">
                      <div>
                        <p className="text-sm font-medium text-gray-800 group-hover:text-blue-600">{o.title}</p>
                        <p className="text-xs text-gray-400">{asgn?.title as string ?? '—'}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${RISK_COLORS[o.risk_level]}`}>
                        {o.risk_level}
                      </span>
                    </Link>
                  )
                })}
                {openCriticalHigh.length > 6 && (
                  <div className="px-5 py-2">
                    <Link href="/observations" className="text-xs text-blue-600 hover:underline">View all {openCriticalHigh.length} →</Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Observations risk breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Observations Snapshot</h2>
          <div className="grid grid-cols-4 gap-4">
            {riskBreakdown.map(r => (
              <div key={r.label} className="text-center">
                <p className={`text-2xl font-bold ${r.label === 'critical' ? 'text-red-600' : r.label === 'high' ? 'text-orange-500' : r.label === 'medium' ? 'text-yellow-500' : 'text-green-500'}`}>
                  {r.open}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">{r.label} open</p>
                <p className="text-xs text-gray-400">{r.total} total</p>
                {r.total > 0 && (
                  <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${r.label === 'critical' ? 'bg-red-400' : r.label === 'high' ? 'bg-orange-400' : r.label === 'medium' ? 'bg-yellow-400' : 'bg-green-400'}`}
                      style={{ width: `${Math.round((r.open / r.total) * 100)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Least progress callout */}
        {leastProgress && leastProgress.pct < 50 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">Needs Attention — Lowest Progress</p>
              <p className="font-semibold text-gray-900">{leastProgress.a.title as string}</p>
              <p className="text-sm text-gray-500">{leastProgress.a.client_name as string} · Current AM: {currentAMMap[leastProgress.a.id as string] ?? '—'}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-3xl font-bold text-red-600">{leastProgress.pct}%</p>
                <p className="text-xs text-gray-400">completion</p>
              </div>
              <Link href={`/assignments/${leastProgress.a.id as string}`}
                className="text-sm font-medium bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 whitespace-nowrap">
                Open →
              </Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* AM Activity */}
          {(isManager || isAM) && amStats.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Assistant Manager Activity</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {amStats.map(({ am, count, avgProgress, overdueCount }) => (
                  <div key={am.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
                        {am.full_name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{am.full_name}</p>
                        <p className="text-xs text-gray-400">{count} assignment{count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{avgProgress}%</p>
                        <p className="text-xs text-gray-400">avg progress</p>
                      </div>
                      {overdueCount > 0 && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">{overdueCount} overdue</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Executive Activity */}
          {execStats.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Executive Activity</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {execStats.map(({ ex, areas, subs, completedSubs, overdueCount }) => (
                  <div key={ex.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">
                        {ex.full_name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{ex.full_name}</p>
                        <p className="text-xs text-gray-400">{areas} area{areas !== 1 ? 's' : ''} · {subs} sub-areas</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{completedSubs}/{subs}</p>
                        <p className="text-xs text-gray-400">sub-areas done</p>
                      </div>
                      {overdueCount > 0 && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">{overdueCount} overdue</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Recent Activity</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {recentActivity.map(ev => {
                const asgn = assignments.find(a => a.id === ev.assignmentId)
                return (
                  <div key={ev.key} className="px-5 py-3 flex items-center gap-3">
                    <span className="text-base">{ev.type === 'handover' ? '🔄' : '↩️'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{ev.text}</p>
                      {asgn && (
                        <Link href={`/assignments/${ev.assignmentId}`} className="text-xs text-blue-600 hover:underline">
                          {asgn.title as string}
                        </Link>
                      )}
                    </div>
                    {ev.date && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(ev.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
