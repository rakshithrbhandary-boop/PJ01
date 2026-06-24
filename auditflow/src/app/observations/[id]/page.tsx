'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
}
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-800',
  in_progress: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
}
const ROLE_COLORS: Record<string, string> = {
  manager: 'bg-purple-100 text-purple-700',
  assistant_manager: 'bg-indigo-100 text-indigo-700',
}
const EXEC_RESP_LABELS: Record<string, string> = {
  acknowledged: '✓ Acknowledged & In Progress',
  clarification_needed: '⏳ Clarification Pending from Management',
  disagree: '✔ Completed',
}
const EXEC_RESP_COLORS: Record<string, string> = {
  acknowledged: 'bg-blue-100 text-blue-700',
  clarification_needed: 'bg-yellow-100 text-yellow-700',
  disagree: 'bg-green-100 text-green-700',
}

type Comment = { id: string; comment: string; commenter_name: string; commenter_role: string; created_at: string }

export default function ObservationDetailPage() {
  const { id } = useParams()
  const [obs, setObs] = useState<Record<string, unknown> | null>(null)
  const [assignmentTitle, setAssignmentTitle] = useState('')
  const [raisedByName, setRaisedByName] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [savingComment, setSavingComment] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingExec, setSavingExec] = useState(false)
  const [execResponse, setExecResponse] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(p)
      }

      const { data: o } = await supabase.from('observations').select('*').eq('id', id).single()
      if (!o) { setLoading(false); return }
      setObs(o)
      setExecResponse((o.executive_response as string) ?? '')

      const [{ data: assign }, { data: raiser }, { data: cmts }] = await Promise.all([
        o.assignment_id
          ? supabase.from('assignments').select('title').eq('id', o.assignment_id).single()
          : Promise.resolve({ data: null }),
        o.raised_by
          ? supabase.from('profiles').select('full_name').eq('id', o.raised_by).single()
          : Promise.resolve({ data: null }),
        supabase.from('observation_comments').select('*').eq('observation_id', id).order('created_at'),
      ])
      if (assign) setAssignmentTitle(assign.title)
      if (raiser) setRaisedByName(raiser.full_name)
      if (o.task_id) {
        const { data: task } = await supabase.from('tasks').select('title').eq('id', o.task_id).single()
        if (task) setTaskTitle(task.title)
      }
      setComments((cmts ?? []) as Comment[])
      setLoading(false)
    }
    load()
  }, [id])

  async function postComment() {
    if (!profile || !newComment.trim() || !obs) return
    setSavingComment(true)
    const { data } = await supabase.from('observation_comments').insert({
      observation_id: id,
      comment: newComment.trim(),
      commenter_name: profile.full_name,
      commenter_role: profile.role,
    }).select().single()
    if (data) setComments(prev => [...prev, data as Comment])
    setNewComment('')
    setSavingComment(false)
  }

  async function updateStatus(status: string) {
    setSavingStatus(true)
    await supabase.from('observations').update({ status }).eq('id', id)
    setObs(prev => prev ? { ...prev, status } : prev)
    setSavingStatus(false)
  }

  async function saveExecResponse(val: string) {
    setExecResponse(val)
    setSavingExec(true)
    await supabase.from('observations').update({ executive_response: val }).eq('id', id)
    setObs(prev => prev ? { ...prev, executive_response: val } : prev)
    setSavingExec(false)
  }

  if (loading) return <AppShell><div className="py-12 text-center text-gray-400">Loading...</div></AppShell>
  if (!obs) return <AppShell><div className="py-12 text-center text-gray-400">Observation not found</div></AppShell>

  const isManager = profile?.role === 'manager'
  const isAM = profile?.role === 'assistant_manager'
  const canComment = isManager || isAM
  const hasComments = comments.length > 0 || !!(obs.manager_input as string)

  return (
    <AppShell>
      <div className="max-w-3xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/observations" className="hover:text-blue-600">Observations</Link>
          <span>/</span>
          <span className="text-gray-900">{obs.title as string}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{obs.title as string}</h1>
            {assignmentTitle && (
              <p className="text-gray-500 mt-1">
                Assignment: <Link href={`/assignments/${obs.assignment_id as string}`} className="text-blue-600 hover:underline">{assignmentTitle}</Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium px-3 py-1.5 rounded-full capitalize ${RISK_COLORS[obs.risk_level as string] ?? 'bg-gray-100'}`}>
              {obs.risk_level as string}
            </span>
            <span className={`text-sm font-medium px-3 py-1.5 rounded-full capitalize ${STATUS_COLORS[obs.status as string] ?? 'bg-gray-100'}`}>
              {(obs.status as string).replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        <div className="space-y-5">
          {/* Meta info */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Raised By</p>
              <p className="font-medium text-gray-900">{raisedByName || '—'}</p>
            </div>
            {taskTitle && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Related Task</p>
                <p className="font-medium text-gray-900">{taskTitle}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Raised On</p>
              <p className="font-medium text-gray-900">{new Date(obs.created_at as string).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Description</p>
            <p className="text-gray-800 text-sm leading-relaxed">{obs.description as string}</p>
          </div>

          {/* Status update for manager/AM */}
          {canComment && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Update Status</p>
              <select value={obs.status as string} onChange={e => updateStatus(e.target.value)} disabled={savingStatus}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          )}

          {/* Comments thread */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Comments / Action Required</p>

            <div className="space-y-3 mb-4">
              {/* Legacy comment */}
              {(obs.manager_input as string) && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-800">{(obs.manager_input_by_name as string) || 'Management'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[(obs.manager_input_by_role as string)] ?? 'bg-gray-100 text-gray-600'}`}>
                      {((obs.manager_input_by_role as string) || 'manager').replace('_', ' ')}
                    </span>
                    {(obs.manager_input_at as string) && (
                      <span className="text-xs text-gray-400">· {new Date(obs.manager_input_at as string).toLocaleString()}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{obs.manager_input as string}</p>
                </div>
              )}

              {!obs.manager_input && comments.length === 0 && (
                <p className="text-sm text-gray-400">No comments yet.</p>
              )}

              {comments.map(c => (
                <div key={c.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-800">{c.commenter_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[c.commenter_role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {c.commenter_role.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-400">· {new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-gray-700">{c.comment}</p>
                </div>
              ))}
            </div>

            {canComment && (
              <div>
                <textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={3}
                  placeholder="Add a comment or action note..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <button onClick={postComment} disabled={savingComment || !newComment.trim()}
                  className="mt-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {savingComment ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            )}
          </div>

          {/* Executive acknowledgement */}
          {hasComments && !canComment && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Your Acknowledgement</p>
              <div className="flex items-center gap-3">
                <select value={execResponse} onChange={e => saveExecResponse(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select response —</option>
                  <option value="acknowledged">✓ Acknowledged & In Progress</option>
                  <option value="clarification_needed">⏳ Clarification Pending from Management</option>
                  <option value="disagree">✔ Completed</option>
                </select>
                {savingExec && <span className="text-gray-400 text-sm">Saving...</span>}
                {execResponse && !savingExec && <span className="text-green-600 text-sm">✓ Saved</span>}
              </div>
            </div>
          )}

          {/* Show exec response to manager/AM */}
          {canComment && (obs.executive_response as string) && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Executive Response</p>
              <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${EXEC_RESP_COLORS[obs.executive_response as string] ?? 'bg-gray-100 text-gray-700'}`}>
                {EXEC_RESP_LABELS[obs.executive_response as string] ?? obs.executive_response as string}
              </span>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
