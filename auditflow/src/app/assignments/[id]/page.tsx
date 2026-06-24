'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-yellow-100 text-yellow-800', in_progress: 'bg-blue-100 text-blue-800',
  fieldwork: 'bg-indigo-100 text-indigo-800', data_collection: 'bg-cyan-100 text-cyan-800',
  analysis: 'bg-purple-100 text-purple-800', pending_review: 'bg-orange-100 text-orange-800',
  pending_clarification: 'bg-red-100 text-red-800', completed: 'bg-green-100 text-green-800',
  on_hold: 'bg-gray-100 text-gray-800',
}
const AREA_STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-700', in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700',
}
const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800', medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800', critical: 'bg-red-100 text-red-800',
}

type AreaRow = Record<string, unknown> & { subAreas?: AreaRow[] }

export default function AssignmentDetailPage() {
  const { id } = useParams()
  const [assignment, setAssignment] = useState<Record<string, unknown> | null>(null)
  const [areas, setAreas] = useState<AreaRow[]>([])
  const [observations, setObservations] = useState<Record<string, unknown>[]>([])
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  const [executives, setExecutives] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Area form (top-level)
  const [showAreaForm, setShowAreaForm] = useState(false)
  const [areaForm, setAreaForm] = useState({ title: '', assigned_to: '', priority: 'medium', due_date: '' })
  const [savingArea, setSavingArea] = useState(false)

  // Sub-area form (child of an area)
  const [showSubAreaForm, setShowSubAreaForm] = useState<string | null>(null)
  const [subAreaForm, setSubAreaForm] = useState({ title: '', assigned_to: '', priority: 'medium', due_date: '' })
  const [savingSubArea, setSavingSubArea] = useState(false)

  // Expand/collapse areas
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({})

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  // Delegation
  const [delegatingSubArea, setDelegatingSubArea] = useState<string | null>(null)
  const [delegateTo, setDelegateTo] = useState('')
  const [delegateNote, setDelegateNote] = useState('')
  const [savingDelegate, setSavingDelegate] = useState(false)

  // Handover
  const [showHandover, setShowHandover] = useState(false)
  const [otherAMs, setOtherAMs] = useState<{ id: string; full_name: string }[]>([])
  const [handoverForm, setHandoverForm] = useState({ to_am: '', type: 'temporary', return_date: '', reason: '' })
  const [savingHandover, setSavingHandover] = useState(false)
  const [handoverHistory, setHandoverHistory] = useState<Record<string, unknown>[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setCurrentProfile(p)
      }
      const [{ data: a }, { data: allTasks }, { data: o }, { data: ex }, { data: ams }, { data: hist }] = await Promise.all([
        supabase.from('assignments').select('*, manager:profiles!assignments_manager_id_fkey(full_name), assigned_to_profile:profiles!assignments_assigned_to_fkey(full_name)').eq('id', id).single(),
        supabase.from('tasks').select('*').eq('assignment_id', id).order('created_at'),
        supabase.from('observations').select('*').eq('assignment_id', id).order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name').eq('role', 'executive'),
        supabase.from('profiles').select('id, full_name').eq('role', 'assistant_manager'),
        supabase.from('assignment_handovers').select('*').eq('assignment_id', id).order('created_at'),
      ])
      setAssignment(a)
      setObservations(o ?? [])
      setExecutives(ex ?? [])
      setOtherAMs(ams ?? [])
      setHandoverHistory(hist ?? [])

      // Resolve assignee names
      const taskList = allTasks ?? []
      const assigneeIds = [...new Set(taskList.map(t => t.assigned_to as string).filter(Boolean))]
      const { data: assigneeProfiles } = assigneeIds.length > 0
        ? await supabase.from('profiles').select('id, full_name').in('id', assigneeIds)
        : { data: [] as { id: string; full_name: string }[] }
      const nameMap = Object.fromEntries((assigneeProfiles ?? []).map(p => [p.id, p.full_name]))
      const withNames = taskList.map(t => ({ ...t, _assigneeName: nameMap[t.assigned_to as string] ?? 'Unassigned' }))

      // Build area → sub-area tree (parent_id IS NULL = area, parent_id SET = sub-area)
      const topLevel = withNames.filter(t => !t.parent_id)
      const children = withNames.filter(t => !!t.parent_id)
      const tree: AreaRow[] = topLevel.map(a => ({
        ...a,
        subAreas: children.filter(c => c.parent_id === a.id),
      }))
      setAreas(tree)
      setLoading(false)
    }
    load()
  }, [id])

  function buildTree(allRows: AreaRow[]) {
    const top = allRows.filter(t => !t.parent_id)
    const child = allRows.filter(t => !!t.parent_id)
    return top.map(a => ({ ...a, subAreas: child.filter(c => c.parent_id === a.id) }))
  }

  async function addArea() {
    if (!areaForm.title || !areaForm.due_date) return
    if (!isExecutive && !areaForm.assigned_to) return
    setSavingArea(true)
    const { data } = await supabase.from('tasks').insert({
      assignment_id: id,
      title: areaForm.title,
      assigned_to: isExecutive ? currentProfile!.id : areaForm.assigned_to,
      priority: areaForm.priority,
      due_date: areaForm.due_date,
      status: 'not_started',
      parent_id: null,
    }).select('*').single()
    if (data) {
      const nameMap = Object.fromEntries(executives.map(e => [e.id, e.full_name]))
      const withName = { ...data, _assigneeName: nameMap[data.assigned_to] ?? 'Unassigned', subAreas: [] }
      setAreas(prev => [...prev, withName])
    }
    setAreaForm({ title: '', assigned_to: '', priority: 'medium', due_date: '' })
    setShowAreaForm(false)
    setSavingArea(false)
  }

  async function addSubArea(parentId: string) {
    if (!subAreaForm.title || !subAreaForm.due_date) return
    if (!isExecutive && !subAreaForm.assigned_to) return
    setSavingSubArea(true)
    const { data } = await supabase.from('tasks').insert({
      assignment_id: id,
      title: subAreaForm.title,
      assigned_to: isExecutive ? currentProfile!.id : subAreaForm.assigned_to,
      priority: subAreaForm.priority,
      due_date: subAreaForm.due_date,
      status: 'not_started',
      parent_id: parentId,
    }).select('*').single()
    if (data) {
      const nameMap = Object.fromEntries(executives.map(e => [e.id, e.full_name]))
      const withName = { ...data, _assigneeName: nameMap[data.assigned_to] ?? 'Unassigned' }
      setAreas(prev => prev.map(a => a.id === parentId
        ? { ...a, subAreas: [...(a.subAreas ?? []), withName] }
        : a
      ))
    }
    setSubAreaForm({ title: '', assigned_to: '', priority: 'medium', due_date: '' })
    setShowSubAreaForm(null)
    setSavingSubArea(false)
  }

  async function updateAreaStatus(areaId: string, status: string, parentId?: string) {
    setUpdatingStatus(areaId)
    await supabase.from('tasks').update({ status }).eq('id', areaId)
    setAreas(prev => prev.map(a => {
      if (!parentId && a.id === areaId) return { ...a, status }
      if (parentId && a.id === parentId) return { ...a, subAreas: (a.subAreas ?? []).map(s => s.id === areaId ? { ...s, status } : s) }
      return a
    }))
    setUpdatingStatus(null)
  }

  async function delegateSubArea() {
    if (!delegatingSubArea || !delegateTo || !currentProfile) return
    setSavingDelegate(true)
    const target = executives.find(e => e.id === delegateTo)
    await supabase.from('tasks').update({ assigned_to: delegateTo, delegated_from: currentProfile.id, delegation_note: delegateNote || null }).eq('id', delegatingSubArea)
    setAreas(prev => prev.map(a => ({
      ...a,
      subAreas: (a.subAreas ?? []).map(s => s.id === delegatingSubArea
        ? { ...s, assigned_to: delegateTo, _assigneeName: target?.full_name ?? '', delegated_from: currentProfile.id }
        : s
      ),
    })))
    setDelegatingSubArea(null); setDelegateTo(''); setDelegateNote('')
    setSavingDelegate(false)
  }

  async function confirmHandover() {
    if (!handoverForm.to_am || !currentProfile) return
    setSavingHandover(true)
    const toAM = otherAMs.find(a => a.id === handoverForm.to_am)
    const record = {
      assignment_id: id as string,
      from_am_id: currentProfile.id,
      from_am_name: currentProfile.full_name,
      to_am_id: handoverForm.to_am,
      to_am_name: toAM?.full_name ?? '',
      handover_type: handoverForm.type,
      return_date: handoverForm.type === 'temporary' && handoverForm.return_date ? handoverForm.return_date : null,
      reason: handoverForm.reason,
    }
    const { data: newHistory } = await supabase.from('assignment_handovers').insert(record).select().single()
    await supabase.from('assignments').update({ assigned_to: handoverForm.to_am }).eq('id', id as string)
    setAssignment(prev => prev ? { ...prev, assigned_to: handoverForm.to_am } : prev)
    if (newHistory) setHandoverHistory(prev => [...prev, newHistory])
    setShowHandover(false)
    setHandoverForm({ to_am: '', type: 'temporary', return_date: '', reason: '' })
    setSavingHandover(false)
  }

  if (loading) return <AppShell><div className="py-12 text-center text-gray-400">Loading...</div></AppShell>
  if (!assignment) return <AppShell><div className="py-12 text-center text-gray-400">Assignment not found</div></AppShell>

  const isManager = currentProfile?.role === 'manager'
  const isAssistantManager = currentProfile?.role === 'assistant_manager'
  const isExecutive = currentProfile?.role === 'executive'

  const lastHandover = handoverHistory.length > 0 ? handoverHistory[handoverHistory.length - 1] : null
  const currentHandlerId = lastHandover ? (lastHandover.to_am_id as string) : (assignment.assigned_to as string)
  const isCurrentAM = isAssistantManager && currentHandlerId === currentProfile?.id
  const isPreviousAM = isAssistantManager && !isCurrentAM &&
    handoverHistory.some(h => h.from_am_id === currentProfile?.id || h.to_am_id === currentProfile?.id)
  const isManagerOfThis = isManager && (assignment.manager_id as string) === currentProfile?.id
  const canManage = isManagerOfThis || isCurrentAM

  const assignedToName =
    (lastHandover ? (lastHandover.to_am_name as string) : null)
    ?? otherAMs.find(a => a.id === (assignment.assigned_to as string))?.full_name
    ?? (assignment.assigned_to_profile as { full_name?: string } | null)?.full_name
  const managerName = (assignment.manager as { full_name?: string })?.full_name

  // Involved executives = those assigned to any area or sub-area
  const allAssignedIds = new Set([
    ...areas.map(a => a.assigned_to as string),
    ...areas.flatMap(a => (a.subAreas ?? []).map(s => s.assigned_to as string)),
  ].filter(Boolean))
  const involvedExecutives = executives.filter(e => allAssignedIds.has(e.id))

  const totalSubAreas = areas.reduce((n, a) => n + (a.subAreas?.length ?? 0), 0)
  const completedSubAreas = areas.reduce((n, a) => n + (a.subAreas ?? []).filter(s => s.status === 'completed').length, 0)

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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{assignment.title as string}</h1>
              {(assignment.code as string) && (
                <span className="text-sm font-mono font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                  {assignment.code as string}
                </span>
              )}
            </div>
            <p className="text-gray-500 mt-1">{assignment.client_name as string}</p>
            {isPreviousAM && (
              <p className="text-xs text-orange-600 mt-1 font-medium">View only — handed over to {assignedToName}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium px-3 py-1.5 rounded-full capitalize ${STATUS_COLORS[assignment.status as string] ?? 'bg-gray-100'}`}>
              {(assignment.status as string).replace(/_/g, ' ')}
            </span>
            {isCurrentAM && (
              <button onClick={() => setShowHandover(true)} className="text-sm text-orange-600 border border-orange-200 px-3 py-1.5 rounded-lg hover:bg-orange-50">Handover</button>
            )}
            {isManagerOfThis && (
              <Link href={`/assignments/${id}/edit`} className="text-sm text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50">Edit</Link>
            )}
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Type</p>
            <p className="font-medium text-gray-900 mt-1 capitalize">{(assignment.type as string).replace(/_/g, ' ')}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Manager</p>
            <p className="font-medium text-gray-900 mt-1">{managerName ?? '—'}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Currently Handled By (AM)</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="font-medium text-gray-900">{assignedToName ?? 'Unassigned'}</p>
              {handoverHistory.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Handed Over</span>}
            </div>
            {lastHandover && (
              <p className="text-xs text-gray-400 mt-0.5">
                from {lastHandover.from_am_name as string}
                {(lastHandover.return_date as string) ? ` · returns ${lastHandover.return_date as string}` : ''}
              </p>
            )}
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Due Date</p>
            <p className="font-medium text-gray-900 mt-1">{(assignment.due_date as string) || 'Always Active'}</p>
          </div>
        </div>

        {/* Flow overview for manager/AM */}
        {(isManagerOfThis || isCurrentAM || isPreviousAM) && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Assignment Flow</h3>
            <div className="flex items-start gap-4">
              <div className="text-center">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto mb-1">{managerName?.[0]?.toUpperCase() ?? 'M'}</div>
                <p className="text-xs font-medium text-gray-700">{managerName}</p>
                <p className="text-xs text-gray-400">Manager</p>
              </div>
              <div className="flex-1 mt-4 border-t-2 border-dashed border-gray-200 relative">
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 bg-white px-1">assigns to</span>
              </div>
              <div className="text-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto mb-1 ${assignedToName ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                  {assignedToName ? assignedToName[0].toUpperCase() : '?'}
                </div>
                <p className="text-xs font-medium text-gray-700">{assignedToName ?? 'Not Assigned'}</p>
                <p className="text-xs text-gray-400">Asst. Manager</p>
              </div>
              <div className="flex-1 mt-4 border-t-2 border-dashed border-gray-200 relative">
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 bg-white px-1">areas to</span>
              </div>
              <div className="flex gap-3">
                {involvedExecutives.length === 0 ? (
                  <div className="text-center">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 text-sm mx-auto mb-1">?</div>
                    <p className="text-xs text-gray-400">No executives yet</p>
                  </div>
                ) : involvedExecutives.map(ex => (
                  <div key={ex.id} className="text-center">
                    <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto mb-1">{ex.full_name[0].toUpperCase()}</div>
                    <p className="text-xs font-medium text-gray-700">{ex.full_name}</p>
                    <p className="text-xs text-gray-400">Executive</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Areas of Audit + Observations */}
        <div className="grid grid-cols-2 gap-6">

          {/* Areas of Audit */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Areas of Audit ({areas.length})</h3>
                {totalSubAreas > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{completedSubAreas}/{totalSubAreas} sub-areas completed</p>
                )}
              </div>
              {(canManage && !isPreviousAM) && (
                <button onClick={() => setShowAreaForm(!showAreaForm)} className="text-sm text-blue-600 hover:underline">
                  {showAreaForm ? 'Cancel' : '+ Add Area'}
                </button>
              )}
              {isExecutive && (
                <button onClick={() => setShowAreaForm(!showAreaForm)} className="text-sm text-blue-600 hover:underline">
                  {showAreaForm ? 'Cancel' : '+ Take Up Area'}
                </button>
              )}
            </div>

            {/* Add Area Form */}
            {showAreaForm && (
              <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 space-y-3">
                <input placeholder="Area name (e.g. Cash & Bank, Inventory) *" value={areaForm.title}
                  onChange={e => setAreaForm({ ...areaForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {canManage && (
                  <select value={areaForm.assigned_to} onChange={e => setAreaForm({ ...areaForm, assigned_to: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Assign to Executive *</option>
                    {executives.map(ex => <option key={ex.id} value={ex.id}>{ex.full_name}</option>)}
                  </select>
                )}
                {isExecutive && <p className="text-xs text-blue-700 bg-blue-100 px-3 py-1.5 rounded-lg">This area will be assigned to you</p>}
                <div className="grid grid-cols-2 gap-2">
                  <select value={areaForm.priority} onChange={e => setAreaForm({ ...areaForm, priority: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                  <input type="date" value={areaForm.due_date} onChange={e => setAreaForm({ ...areaForm, due_date: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={addArea} disabled={savingArea || !areaForm.title || !areaForm.due_date || (!isExecutive && !areaForm.assigned_to)}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {savingArea ? 'Adding...' : isExecutive ? 'Take Up This Area' : 'Add Area'}
                </button>
              </div>
            )}

            {areas.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No audit areas yet.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {areas.map(area => {
                  const aId = area.id as string
                  const isAreaOpen = expandedAreas[aId] ?? false
                  const isMyArea = (area.assigned_to as string) === currentProfile?.id
                  const canUpdateArea = isMyArea && isExecutive

                  return (
                    <div key={aId}>
                      {/* Area row */}
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* Expand toggle */}
                          <button onClick={() => setExpandedAreas(prev => ({ ...prev, [aId]: !isAreaOpen }))}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 flex-shrink-0">
                            <svg className={`w-3 h-3 transition-transform duration-200 ${isAreaOpen ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-800">{area.title as string}</span>
                              <span className="text-xs text-gray-400">({(area.subAreas ?? []).length} sub-areas)</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              → {area._assigneeName as string} · Due {area.due_date as string}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {canUpdateArea ? (
                              <select value={area.status as string} onChange={e => updateAreaStatus(aId, e.target.value)}
                                disabled={updatingStatus === aId}
                                className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${AREA_STATUS_COLORS[area.status as string] ?? 'bg-gray-100 text-gray-700'}`}>
                                <option value="not_started">Not Started</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="overdue">Overdue</option>
                              </select>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${AREA_STATUS_COLORS[area.status as string] ?? 'bg-gray-100 text-gray-700'}`}>
                                {(area.status as string).replace(/_/g, ' ')}
                              </span>
                            )}
                            {/* Add sub-area button */}
                            {(canManage || isExecutive) && !isPreviousAM && (
                              <button onClick={() => setShowSubAreaForm(showSubAreaForm === aId ? null : aId)}
                                className="text-xs text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded hover:bg-indigo-50">
                                {showSubAreaForm === aId ? '✕' : '+ Sub-area'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Add sub-area form */}
                        {showSubAreaForm === aId && (
                          <div className="mt-3 ml-7 p-3 bg-indigo-50 border border-indigo-100 rounded-lg space-y-2">
                            <p className="text-xs font-semibold text-indigo-800">Add Sub-area to: {area.title as string}</p>
                            <input placeholder="Sub-area name (e.g. Cash Vouching, Bank Reconciliation) *"
                              value={subAreaForm.title} onChange={e => setSubAreaForm({ ...subAreaForm, title: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                            {canManage && (
                              <select value={subAreaForm.assigned_to} onChange={e => setSubAreaForm({ ...subAreaForm, assigned_to: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                <option value="">Assign to Executive *</option>
                                {executives.map(ex => <option key={ex.id} value={ex.id}>{ex.full_name}</option>)}
                              </select>
                            )}
                            {isExecutive && <p className="text-xs text-indigo-700 bg-indigo-100 px-3 py-1.5 rounded-lg">Will be assigned to you</p>}
                            <div className="grid grid-cols-2 gap-2">
                              <select value={subAreaForm.priority} onChange={e => setSubAreaForm({ ...subAreaForm, priority: e.target.value })}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                              <input type="date" value={subAreaForm.due_date} onChange={e => setSubAreaForm({ ...subAreaForm, due_date: e.target.value })}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                            </div>
                            <button onClick={() => addSubArea(aId)}
                              disabled={savingSubArea || !subAreaForm.title || !subAreaForm.due_date || (!isExecutive && !subAreaForm.assigned_to)}
                              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                              {savingSubArea ? 'Adding...' : 'Add Sub-area'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Sub-areas (expanded) */}
                      {isAreaOpen && (area.subAreas ?? []).length > 0 && (
                        <div className="ml-9 border-l-2 border-indigo-100 mb-2">
                          {(area.subAreas ?? []).map(sub => {
                            const sId = sub.id as string
                            const isMySubArea = (sub.assigned_to as string) === currentProfile?.id
                            const canUpdateSub = isMySubArea && isExecutive
                            const isBeingDelegated = delegatingSubArea === sId
                            const delegatableExecutives = involvedExecutives.filter(e => e.id !== currentProfile?.id)

                            return (
                              <div key={sId} className="pl-4 pr-4 py-2.5 border-b border-indigo-50 last:border-0">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm text-gray-700 font-medium">{sub.title as string}</p>
                                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                      <span>→ {sub._assigneeName as string}</span>
                                      {(sub.delegated_from as string) && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded font-medium">Delegated</span>}
                                      <span>· Due {sub.due_date as string}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {canUpdateSub ? (
                                      <select value={sub.status as string} onChange={e => updateAreaStatus(sId, e.target.value, aId)}
                                        disabled={updatingStatus === sId}
                                        className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${AREA_STATUS_COLORS[sub.status as string] ?? 'bg-gray-100 text-gray-700'}`}>
                                        <option value="not_started">Not Started</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                        <option value="overdue">Overdue</option>
                                      </select>
                                    ) : (
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${AREA_STATUS_COLORS[sub.status as string] ?? 'bg-gray-100 text-gray-700'}`}>
                                        {(sub.status as string).replace(/_/g, ' ')}
                                      </span>
                                    )}
                                    {isMySubArea && isExecutive && delegatableExecutives.length > 0 && (
                                      <button onClick={() => { setDelegatingSubArea(isBeingDelegated ? null : sId); setDelegateTo(''); setDelegateNote('') }}
                                        className="text-xs text-purple-600 border border-purple-200 px-2 py-0.5 rounded hover:bg-purple-50">
                                        {isBeingDelegated ? 'Cancel' : 'Delegate'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {/* Delegation panel */}
                                {isBeingDelegated && (
                                  <div className="mt-2 p-3 bg-purple-50 border border-purple-100 rounded-lg space-y-2">
                                    <select value={delegateTo} onChange={e => setDelegateTo(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                                      <option value="">— Select Executive —</option>
                                      {delegatableExecutives.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                                    </select>
                                    <input value={delegateNote} onChange={e => setDelegateNote(e.target.value)}
                                      placeholder="Reason (optional)"
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                                    <button onClick={delegateSubArea} disabled={!delegateTo || savingDelegate}
                                      className="w-full bg-purple-600 text-white py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                                      {savingDelegate ? 'Delegating...' : 'Confirm Delegation'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Expand hint if area has sub-areas but is collapsed */}
                      {!isAreaOpen && (area.subAreas ?? []).length > 0 && (
                        <div className="ml-9 px-4 pb-2">
                          <button onClick={() => setExpandedAreas(prev => ({ ...prev, [aId]: true }))}
                            className="text-xs text-indigo-500 hover:underline">
                            Show {(area.subAreas ?? []).length} sub-area{(area.subAreas ?? []).length !== 1 ? 's' : ''}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
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
                  <Link key={o.id as string} href={`/observations/${o.id as string}`}
                    className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="font-medium text-sm text-gray-900 hover:text-blue-600">{o.title as string}</p>
                      <p className="text-xs text-gray-500">{(o.raiser as { full_name?: string })?.full_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${RISK_COLORS[o.risk_level as string] ?? 'bg-gray-100'}`}>
                        {o.risk_level as string}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        (o.status as string) === 'open' ? 'bg-red-100 text-red-700' :
                        (o.status as string) === 'resolved' ? 'bg-green-100 text-green-700' :
                        (o.status as string) === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }`}>{(o.status as string)?.replace(/_/g, ' ')}</span>
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Handover History */}
        {handoverHistory.length > 0 && (
          <div className="mt-6 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Handover History</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {handoverHistory.map(h => (
                <div key={h.id as string} className="px-6 py-3 flex items-center gap-4 text-sm">
                  <span className="font-medium text-gray-800">{h.from_am_name as string}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-medium text-gray-800">{h.to_am_name as string}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${(h.handover_type as string) === 'permanent' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {h.handover_type as string}
                  </span>
                  {(h.return_date as string) && <span className="text-gray-500">Returns {h.return_date as string}</span>}
                  {(h.reason as string) && <span className="text-gray-400 italic">"{h.reason as string}"</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Handover Modal */}
      {showHandover && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Handover Assignment</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hand over to *</label>
                <select value={handoverForm.to_am} onChange={e => setHandoverForm({ ...handoverForm, to_am: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select Assistant Manager —</option>
                  {otherAMs.filter(a => a.id !== currentProfile?.id).map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Handover Type</label>
                <div className="flex gap-4">
                  {['temporary', 'permanent'].map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer text-sm capitalize">
                      <input type="radio" name="handover_type" value={t} checked={handoverForm.type === t}
                        onChange={() => setHandoverForm({ ...handoverForm, type: t })} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              {handoverForm.type === 'temporary' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Return Date</label>
                  <input type="date" value={handoverForm.return_date} onChange={e => setHandoverForm({ ...handoverForm, return_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason / Note</label>
                <textarea value={handoverForm.reason} onChange={e => setHandoverForm({ ...handoverForm, reason: e.target.value })}
                  rows={2} placeholder="e.g. Going on leave from 1-Jul to 10-Jul"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={confirmHandover} disabled={!handoverForm.to_am || savingHandover}
                className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
                {savingHandover ? 'Confirming...' : 'Confirm Handover'}
              </button>
              <button onClick={() => setShowHandover(false)}
                className="flex-1 text-gray-600 border border-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
