'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import * as XLSX from 'xlsx'

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

  // Return request
  const [returnRequests, setReturnRequests] = useState<Record<string, unknown>[]>([])
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [savingReturn, setSavingReturn] = useState(false)

  // Executive team modal
  const [showExecModal, setShowExecModal] = useState(false)
  const [assignmentExecutives, setAssignmentExecutives] = useState<{ id: string; executive_id: string }[]>([])
  const [allExecWorkload, setAllExecWorkload] = useState<Record<string, { activeAreas: number; latestDue: string | null }>>({})
  const [addingExec, setAddingExec] = useState<string | null>(null)
  const [execSearch, setExecSearch] = useState('')
  const [execError, setExecError] = useState<string | null>(null)
  const [processingReturn, setProcessingReturn] = useState<string | null>(null)

  // Bulk Excel update
  type PendingUpdate = { id: string | null; type: 'Area' | 'Sub-Area'; title: string; changes: Record<string, string>; parentId?: string; isNew?: boolean; parentTitle?: string }
  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([])
  const [showUploadPreview, setShowUploadPreview] = useState(false)
  const [applyingUpdates, setApplyingUpdates] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setCurrentProfile(p)
      }
      const [{ data: a }, { data: allTasks }, { data: o }, { data: ex }, { data: ams }, { data: hist }, { data: retReqs }, { data: assignedExecs }] = await Promise.all([
        supabase.from('assignments').select('*, manager:profiles!assignments_manager_id_fkey(full_name), assigned_to_profile:profiles!assignments_assigned_to_fkey(full_name)').eq('id', id).single(),
        supabase.from('tasks').select('*').eq('assignment_id', id).order('created_at'),
        supabase.from('observations').select('*').eq('assignment_id', id).order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name').eq('role', 'executive'),
        supabase.from('profiles').select('id, full_name').eq('role', 'assistant_manager'),
        supabase.from('assignment_handovers').select('*').eq('assignment_id', id).order('created_at'),
        supabase.from('assignment_return_requests').select('*').eq('assignment_id', id).order('created_at', { ascending: false }),
        supabase.from('assignment_executives').select('id, executive_id').eq('assignment_id', id),
      ])
      setAssignment(a)
      setObservations(o ?? [])
      setExecutives(ex ?? [])
      setOtherAMs(ams ?? [])
      setHandoverHistory(hist ?? [])
      setReturnRequests(retReqs ?? [])
      setAssignmentExecutives(assignedExecs ?? [])

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

  async function requestReturn() {
    if (!currentProfile) return
    setSavingReturn(true)
    const { data: newReq } = await supabase.from('assignment_return_requests').insert({
      assignment_id: id as string,
      requested_by_id: currentProfile.id,
      requested_by_name: currentProfile.full_name,
      reason: returnReason || null,
      status: 'pending',
    }).select().single()
    if (newReq) setReturnRequests(prev => [newReq, ...prev])
    setShowReturnModal(false)
    setReturnReason('')
    setSavingReturn(false)
  }

  async function acceptReturn(requestId: string, requestedById: string, requestedByName: string) {
    if (!currentProfile) return
    setProcessingReturn(requestId)
    // Create reverse handover record
    const record = {
      assignment_id: id as string,
      from_am_id: currentProfile.id,
      from_am_name: currentProfile.full_name,
      to_am_id: requestedById,
      to_am_name: requestedByName,
      handover_type: 'return',
      reason: 'Return request accepted',
    }
    const { data: newHistory } = await supabase.from('assignment_handovers').insert(record).select().single()
    await supabase.from('assignments').update({ assigned_to: requestedById }).eq('id', id as string)
    await supabase.from('assignment_return_requests').update({ status: 'accepted' }).eq('id', requestId)
    if (newHistory) setHandoverHistory(prev => [...prev, newHistory])
    setAssignment(prev => prev ? { ...prev, assigned_to: requestedById } : prev)
    setReturnRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'accepted' } : r))
    setProcessingReturn(null)
  }

  async function declineReturn(requestId: string) {
    setProcessingReturn(requestId)
    await supabase.from('assignment_return_requests').update({ status: 'declined' }).eq('id', requestId)
    setReturnRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'declined' } : r))
    setProcessingReturn(null)
  }

  async function openExecModal() {
    setShowExecModal(true)
    // Fetch workload: all tasks across all assignments for each executive
    const { data: allExecTasks } = await supabase
      .from('tasks')
      .select('assigned_to, status, due_date, assignment_id')
      .in('assigned_to', executives.map(e => e.id))
    const workload: Record<string, { activeAreas: number; latestDue: string | null }> = {}
    for (const ex of executives) {
      const myTasks = (allExecTasks ?? []).filter(t => t.assigned_to === ex.id && t.status !== 'completed')
      const dues = myTasks.map(t => t.due_date as string).filter(Boolean).sort()
      workload[ex.id] = { activeAreas: myTasks.length, latestDue: dues[dues.length - 1] ?? null }
    }
    setAllExecWorkload(workload)
  }

  async function addExecToAssignment(execId: string) {
    setAddingExec(execId)
    setExecError(null)
    const { data, error } = await supabase.from('assignment_executives').insert({
      assignment_id: id as string,
      executive_id: execId,
      added_by: currentProfile?.id,
    }).select('id, executive_id').single()
    if (error) {
      setExecError(error.message)
    } else if (data) {
      setAssignmentExecutives(prev => [...prev, data])
    }
    setAddingExec(null)
  }

  async function removeExecFromAssignment(execId: string) {
    const row = assignmentExecutives.find(r => r.executive_id === execId)
    if (!row) return
    setAddingExec(execId)
    setExecError(null)
    const { error } = await supabase.from('assignment_executives').delete().eq('id', row.id)
    if (error) {
      setExecError(error.message)
    } else {
      setAssignmentExecutives(prev => prev.filter(r => r.executive_id !== execId))
    }
    setAddingExec(null)
  }

  async function downloadAreaExcel() {
    const payload = {
      assignmentTitle: assignment?.title as string ?? 'assignment',
      executives,
      areas: areas.map(area => ({
        id: area.id as string,
        title: area.title as string,
        assigneeName: area._assigneeName as string,
        status: area.status as string,
        priority: area.priority as string,
        due_date: area.due_date as string,
        subAreas: (area.subAreas ?? []).map(sub => ({
          id: sub.id as string,
          title: sub.title as string,
          assigneeName: sub._assigneeName as string,
          status: sub.status as string,
          priority: sub.priority as string,
          due_date: sub.due_date as string,
        })),
      })),
    }
    const res = await fetch('/api/excel-areas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${payload.assignmentTitle}-areas.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseCellDate(val: unknown): string {
    if (!val) return ''
    if (typeof val === 'number') {
      // Excel serial date → JS Date
      const d = XLSX.SSF.parse_date_code(val)
      if (d) {
        const mm = String(d.m).padStart(2, '0')
        const dd = String(d.d).padStart(2, '0')
        return `${d.y}-${mm}-${dd}`
      }
    }
    const s = String(val).trim()
    // Accept YYYY-MM-DD or M/D/YYYY or D/M/YYYY
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const parsed = new Date(s)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
    return s
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { cellDates: true })
    const ws = wb.Sheets['Areas']
    if (!ws) { alert('Sheet "Areas" not found. Please use the downloaded template.'); return }

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true, defval: '' })

    const execNameMap = new Map(executives.map(e => [e.full_name.trim().toLowerCase(), e]))

    const updates: PendingUpdate[] = []
    const skipped: string[] = []
    for (const row of raw) {
      const rowId = (String(row['ID'] ?? '').trim()) || null
      const areaTitle = String(row['Area'] ?? '').trim()
      const subAreaTitle = String(row['Sub-Area'] ?? '').trim()
      const rowType: 'Area' | 'Sub-Area' = subAreaTitle ? 'Sub-Area' : 'Area'
      if (!areaTitle) continue

      const newAssignee = String(row['Assigned To Executive'] ?? '').trim()
      const exec = execNameMap.get(newAssignee.toLowerCase())
      const priorityVal = String(row['Priority'] ?? '').trim()
      const rawDue = row['Due Date (YYYY-MM-DD)']
      const dueVal = rawDue instanceof Date
        ? rawDue.toISOString().slice(0, 10)
        : parseCellDate(rawDue)

      if (rowId) {
        // Existing row — check for changes
        let current: AreaRow | undefined
        let parentId: string | undefined
        for (const area of areas) {
          if ((area.id as string) === rowId) { current = area; break }
          for (const sub of area.subAreas ?? []) {
            if ((sub.id as string) === rowId) { current = sub; parentId = area.id as string; break }
          }
          if (current) break
        }
        if (!current) continue
        const changes: Record<string, string> = {}
        if (exec && exec.id !== (current.assigned_to as string)) changes.assigned_to = exec.id
        if (priorityVal && priorityVal !== (current.priority as string)) changes.priority = priorityVal
        if (dueVal && dueVal !== (current.due_date as string)) changes.due_date = dueVal
        if (Object.keys(changes).length > 0) {
          updates.push({ id: rowId, type: rowType, title: current.title as string, changes, parentId })
        }
      } else {
        // New row — create it
        if (!exec || !dueVal) {
          const label = subAreaTitle || areaTitle
          if (!exec) skipped.push(`"${label}" — executive "${newAssignee}" not found (check spelling)`)
          else skipped.push(`"${label}" — missing due date`)
          continue
        }
        const titleForNew = rowType === 'Sub-Area' ? subAreaTitle : areaTitle
        // Parent area may exist in DB or may be a new area earlier in this same upload batch
        const parentArea = rowType === 'Sub-Area'
          ? areas.find(a => (a.title as string) === areaTitle)
          : undefined
        const parentInBatch = rowType === 'Sub-Area' && !parentArea
          ? updates.find(u => u.isNew && u.type === 'Area' && u.title === areaTitle)
          : undefined
        if (rowType === 'Sub-Area' && !parentArea && !parentInBatch) {
          skipped.push(`"${subAreaTitle}" — parent area "${areaTitle}" not found`)
          continue
        }
        updates.push({
          id: null,
          isNew: true,
          type: rowType,
          title: titleForNew,
          parentTitle: rowType === 'Sub-Area' ? areaTitle : undefined,
          parentId: parentArea ? (parentArea.id as string) : undefined, // parentInBatch resolved later in applyBulkUpdates
          changes: {
            assigned_to: exec.id,
            priority: priorityVal || 'medium',
            due_date: dueVal,
          },
        })
      }
    }

    if (updates.length === 0) {
      const hint = skipped.length > 0
        ? `\n\nSkipped rows:\n${skipped.join('\n')}`
        : '\n\nMake sure:\n• "Assigned To Executive" exactly matches an executive name\n• "Due Date (YYYY-MM-DD)" is filled'
      alert(`No changes or new rows detected.${hint}`)
      return
    }
    setPendingUpdates(updates)
    setShowUploadPreview(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function applyBulkUpdates() {
    setApplyingUpdates(true)
    // Map from area title → newly inserted area ID (for resolving sub-area parents)
    const newAreaIdByTitle: Record<string, string> = {}
    for (const u of pendingUpdates) {
      if (u.isNew) {
        let parentId = u.parentId ?? null
        // If parent was also new in this batch, resolve its ID
        if (!parentId && u.type === 'Sub-Area' && u.parentTitle) {
          parentId = newAreaIdByTitle[u.parentTitle] ?? null
        }
        const { data: inserted } = await supabase.from('tasks').insert({
          assignment_id: id as string,
          title: u.title,
          parent_id: parentId,
          status: 'not_started',
          ...u.changes,
        }).select('id').single()
        if (u.type === 'Area' && inserted?.id) {
          newAreaIdByTitle[u.title] = inserted.id
        }
      } else {
        await supabase.from('tasks').update(u.changes).eq('id', u.id)
      }
    }
    // Refresh areas in state
    const { data: allTasks } = await supabase.from('tasks').select('*').eq('assignment_id', id as string).order('created_at')
    const taskList = allTasks ?? []
    const assigneeIds = [...new Set(taskList.map(t => t.assigned_to as string).filter(Boolean))]
    const { data: assigneeProfiles } = assigneeIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', assigneeIds)
      : { data: [] as { id: string; full_name: string }[] }
    const nameMap = Object.fromEntries((assigneeProfiles ?? []).map(p => [p.id, p.full_name]))
    const withNames = taskList.map(t => ({ ...t, _assigneeName: nameMap[t.assigned_to as string] ?? 'Unassigned' }))
    const top = withNames.filter(t => !t.parent_id)
    const children = withNames.filter(t => !!t.parent_id)
    setAreas(top.map(a => ({ ...a, subAreas: children.filter(c => c.parent_id === a.id) })))
    setApplyingUpdates(false)
    setShowUploadPreview(false)
    setPendingUpdates([])
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

  // Involved executives = explicitly added to assignment OR assigned to any area/sub-area
  const allAssignedIds = new Set([
    ...areas.map(a => a.assigned_to as string),
    ...areas.flatMap(a => (a.subAreas ?? []).map(s => s.assigned_to as string)),
    ...assignmentExecutives.map(r => r.executive_id),
  ].filter(Boolean))
  const involvedExecutives = executives.filter(e => allAssignedIds.has(e.id))

  const pendingReturnRequest = returnRequests.find(r => r.status === 'pending')
  const myPendingRequest = isPreviousAM && pendingReturnRequest && (pendingReturnRequest.requested_by_id as string) === currentProfile?.id
  const incomingReturnRequest = isCurrentAM && pendingReturnRequest

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
            {isPreviousAM && !myPendingRequest && (
              <button onClick={() => setShowReturnModal(true)}
                className="text-sm text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-50">
                Request Return
              </button>
            )}
            {myPendingRequest && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg font-medium">
                Return Requested ·  Awaiting response
              </span>
            )}
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

        {/* Incoming return request banner for current AM */}
        {incomingReturnRequest && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-4">
            <div className="text-2xl">↩️</div>
            <div className="flex-1">
              <p className="font-semibold text-green-900 text-sm">Return Request from {incomingReturnRequest.requested_by_name as string}</p>
              {(incomingReturnRequest.reason as string) && (
                <p className="text-green-700 text-xs mt-0.5 italic">"{incomingReturnRequest.reason as string}"</p>
              )}
              <p className="text-green-600 text-xs mt-1">
                Requested {new Date(incomingReturnRequest.created_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => acceptReturn(incomingReturnRequest.id as string, incomingReturnRequest.requested_by_id as string, incomingReturnRequest.requested_by_name as string)}
                disabled={processingReturn === (incomingReturnRequest.id as string)}
                className="text-sm font-medium bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">
                {processingReturn === (incomingReturnRequest.id as string) ? 'Processing...' : 'Accept'}
              </button>
              <button
                onClick={() => declineReturn(incomingReturnRequest.id as string)}
                disabled={processingReturn === (incomingReturnRequest.id as string)}
                className="text-sm font-medium text-red-600 border border-red-200 px-4 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">
                Decline
              </button>
            </div>
          </div>
        )}

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
              <div className="flex gap-3 items-start">
                {involvedExecutives.length === 0 ? (
                  <div className="text-center cursor-pointer group" onClick={canManage ? openExecModal : undefined}>
                    <div className="w-10 h-10 bg-gray-200 group-hover:bg-blue-100 rounded-full flex items-center justify-center text-gray-400 group-hover:text-blue-500 text-sm mx-auto mb-1 transition-colors">?</div>
                    <p className="text-xs text-gray-400 group-hover:text-blue-500">
                      {canManage ? '+ Add Executives' : 'No executives yet'}
                    </p>
                  </div>
                ) : (
                  <>
                    {involvedExecutives.map(ex => (
                      <div key={ex.id} className="text-center">
                        <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto mb-1">{ex.full_name[0].toUpperCase()}</div>
                        <p className="text-xs font-medium text-gray-700">{ex.full_name}</p>
                        <p className="text-xs text-gray-400">Executive</p>
                      </div>
                    ))}
                    {canManage && (
                      <button onClick={openExecModal}
                        className="w-10 h-10 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 text-sm transition-colors mt-0.5">
                        +
                      </button>
                    )}
                  </>
                )}
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
              <div className="flex items-center gap-2">
                <button onClick={downloadAreaExcel}
                  className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
                  ⬇ Excel
                </button>
                {canManage && (
                  <>
                    <button onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-green-700 border border-green-200 px-2.5 py-1.5 rounded-lg hover:bg-green-50 flex items-center gap-1.5">
                      ⬆ Upload
                    </button>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
                  </>
                )}
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

      {/* Return Request Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Request Return of Assignment</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will notify the current AM ({assignedToName}) who can accept or decline.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <textarea value={returnReason} onChange={e => setReturnReason(e.target.value)}
                  rows={3} placeholder="e.g. Leave period ended, ready to resume"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={requestReturn} disabled={savingReturn}
                className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {savingReturn ? 'Sending...' : 'Send Return Request'}
              </button>
              <button onClick={() => { setShowReturnModal(false); setReturnReason('') }}
                className="flex-1 text-gray-600 border border-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Preview Modal */}
      {showUploadPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl mx-4 flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Review Changes</h2>
              <p className="text-sm text-gray-500 mt-0.5">{pendingUpdates.length} row{pendingUpdates.length !== 1 ? 's' : ''} will be updated</p>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {pendingUpdates.map((u, i) => (
                <div key={i} className="px-6 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    {u.isNew
                      ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">+ New {u.type}</span>
                      : <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.type === 'Area' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>Edit {u.type}</span>
                    }
                    <span className="text-sm font-semibold text-gray-800">{u.title}</span>
                    {u.parentTitle && <span className="text-xs text-gray-400">under {u.parentTitle}</span>}
                  </div>
                  <div className="space-y-0.5">
                    {Object.entries(u.changes).map(([field, val]) => {
                      const label = field === 'assigned_to' ? 'Assigned To' : field.replace(/_/g, ' ')
                      const displayVal = field === 'assigned_to' ? executives.find(e => e.id === val)?.full_name ?? val : val
                      return (
                        <p key={field} className="text-xs text-gray-500">
                          <span className="capitalize font-medium text-gray-700">{label}:</span> → <span className="text-green-700 font-medium">{displayVal}</span>
                        </p>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={applyBulkUpdates} disabled={applyingUpdates}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {applyingUpdates ? 'Applying...' : `Apply ${pendingUpdates.length} Change${pendingUpdates.length !== 1 ? 's' : ''}`}
              </button>
              <button onClick={() => { setShowUploadPreview(false); setPendingUpdates([]) }}
                className="flex-1 text-gray-600 border border-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Executive Team Modal */}
      {showExecModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Executive Team</h2>
                <p className="text-sm text-gray-500 mt-0.5">Add or remove executives from this assignment</p>
              </div>
              <button onClick={() => setShowExecModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-light leading-none">×</button>
            </div>
            {execError && (
              <div className="px-6 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">
                Error: {execError}
              </div>
            )}
            <div className="px-6 py-3 border-b border-gray-100">
              <input
                placeholder="Search executives..."
                value={execSearch}
                onChange={e => setExecSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {executives
                .filter(ex => ex.full_name.toLowerCase().includes(execSearch.toLowerCase()))
                .map(ex => {
                  const isAdded = assignmentExecutives.some(r => r.executive_id === ex.id)
                  const wl = allExecWorkload[ex.id]
                  return (
                    <div key={ex.id} className="px-6 py-4 flex items-center gap-4">
                      <div className="w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {ex.full_name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{ex.full_name}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          {wl ? (
                            <>
                              <span>{wl.activeAreas} active area{wl.activeAreas !== 1 ? 's' : ''}</span>
                              {wl.latestDue && <span>· Available after {wl.latestDue}</span>}
                            </>
                          ) : (
                            <span className="text-gray-300">Loading workload...</span>
                          )}
                        </div>
                      </div>
                      <div>
                        {isAdded ? (
                          <button
                            onClick={() => removeExecFromAssignment(ex.id)}
                            disabled={addingExec === ex.id}
                            className="text-xs font-medium text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">
                            {addingExec === ex.id ? '...' : 'Remove'}
                          </button>
                        ) : (
                          <button
                            onClick={() => addExecToAssignment(ex.id)}
                            disabled={addingExec === ex.id}
                            className="text-xs font-medium text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                            {addingExec === ex.id ? 'Adding...' : '+ Add'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              {executives.filter(ex => ex.full_name.toLowerCase().includes(execSearch.toLowerCase())).length === 0 && (
                <div className="px-6 py-10 text-center text-gray-400 text-sm">No executives found</div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-100">
              <button onClick={() => setShowExecModal(false)}
                className="w-full text-sm text-gray-600 border border-gray-300 py-2 rounded-lg hover:bg-gray-50">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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
