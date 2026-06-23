'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}
const ROLE_COLORS: Record<string, string> = {
  manager: 'bg-purple-100 text-purple-700',
  assistant_manager: 'bg-indigo-100 text-indigo-700',
}
const EXEC_RESP_LABELS: Record<string, string> = {
  acknowledged: '✓ Acknowledged',
  in_progress: '⏳ Working on it',
  clarification_needed: '❓ Clarification Needed',
  disagree: '✗ Disagree',
}
const EXEC_RESP_COLORS: Record<string, string> = {
  acknowledged: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  clarification_needed: 'bg-yellow-100 text-yellow-700',
  disagree: 'bg-red-100 text-red-700',
}

type Comment = { id: string; comment: string; commenter_name: string; commenter_role: string; created_at: string }
type Obs = Record<string, unknown> & { _comments?: Comment[]; _commentsLoaded?: boolean }

function isAddressed(o: Obs): boolean {
  return !!(o.executive_response as string)
}

export default function ObservationsPage() {
  const [grouped, setGrouped] = useState<{ assignmentId: string; title: string; obs: Obs[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [expandedObs, setExpandedObs] = useState<Record<string, boolean>>({})
  const [newComment, setNewComment] = useState<Record<string, string>>({})
  const [savingComment, setSavingComment] = useState<string | null>(null)
  const [execResponses, setExecResponses] = useState<Record<string, string>>({})
  const [savingExec, setSavingExec] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(p)
      }

      const { data: obsData } = await supabase
        .from('observations')
        .select('*')
        .order('created_at', { ascending: false })

      if (!obsData) { setLoading(false); return }

      const assignmentIds = [...new Set(obsData.map(o => o.assignment_id).filter(Boolean))]
      const { data: assignmentsData } = assignmentIds.length > 0
        ? await supabase.from('assignments').select('id, title').in('id', assignmentIds as string[])
        : { data: [] }

      const assignmentMap = Object.fromEntries((assignmentsData ?? []).map(a => [a.id, a.title]))

      // Group by assignment
      const groups: Record<string, { title: string; obs: Obs[] }> = {}
      for (const o of obsData) {
        const aid = o.assignment_id as string
        if (!groups[aid]) groups[aid] = { title: assignmentMap[aid] ?? 'Unknown Assignment', obs: [] }
        groups[aid].obs.push(o as Obs)
      }

      setGrouped(Object.entries(groups).map(([assignmentId, g]) => ({ assignmentId, ...g })))
      setLoading(false)
    }
    load()
  }, [])

  async function toggleObs(oId: string, execResponse: string, currentObs: Obs) {
    setExpandedObs(prev => ({ ...prev, [oId]: !prev[oId] }))
    setExecResponses(prev => ({ ...prev, [oId]: prev[oId] ?? execResponse ?? '' }))

    if (!currentObs._commentsLoaded) {
      const { data } = await supabase
        .from('observation_comments')
        .select('*')
        .eq('observation_id', oId)
        .order('created_at')
      // Update obs in grouped state
      setGrouped(prev => prev.map(g => ({
        ...g,
        obs: g.obs.map(o => o.id === oId ? { ...o, _comments: (data ?? []) as Comment[], _commentsLoaded: true } : o)
      })))
    }
  }

  async function postComment(oId: string, assignmentId: string) {
    if (!profile || !newComment[oId]?.trim()) return
    setSavingComment(oId)
    const { data } = await supabase.from('observation_comments').insert({
      observation_id: oId,
      comment: newComment[oId].trim(),
      commenter_name: profile.full_name,
      commenter_role: profile.role,
    }).select().single()
    if (data) {
      setGrouped(prev => prev.map(g => g.assignmentId === assignmentId ? {
        ...g,
        obs: g.obs.map(o => o.id === oId ? { ...o, _comments: [...(o._comments ?? []), data as Comment] } : o)
      } : g))
      setNewComment(prev => ({ ...prev, [oId]: '' }))
    }
    setSavingComment(null)
  }

  async function updateStatus(oId: string, status: string, assignmentId: string) {
    await supabase.from('observations').update({ status }).eq('id', oId)
    setGrouped(prev => prev.map(g => g.assignmentId === assignmentId ? {
      ...g,
      obs: g.obs.map(o => o.id === oId ? { ...o, status } : o)
    } : g))
  }

  const isManager = profile?.role === 'manager'
  const isAM = profile?.role === 'assistant_manager'
  const canComment = isManager || isAM

  if (loading) return <AppShell><div className="py-12 text-center text-gray-400">Loading...</div></AppShell>

  return (
    <AppShell>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Observations</h1>
            <p className="text-gray-500 mt-1">Assignment-wise audit findings</p>
          </div>
          <Link href="/observations/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
            + New Observation
          </Link>
        </div>

        {grouped.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 py-12 text-center text-gray-400">No observations yet.</div>
        ) : (
          <div className="space-y-8">
            {grouped.map(({ assignmentId, title, obs }) => {
              const unaddressed = obs.filter(o => !isAddressed(o))
              const addressed = obs.filter(o => isAddressed(o))

              const isGroupOpen = expandedGroups[assignmentId] ?? false

              return (
                <div key={assignmentId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Assignment header */}
                  <div
                    className="bg-gray-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setExpandedGroups(prev => ({ ...prev, [assignmentId]: !prev[assignmentId] }))}
                  >
                    <div className="flex items-center gap-3">
                      <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors text-gray-400 flex-shrink-0">
                        <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isGroupOpen ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <div>
                        <Link href={`/assignments/${assignmentId}`} className="text-base font-semibold text-gray-900 hover:text-blue-600" onClick={e => e.stopPropagation()}>
                          {title}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">{obs.length} observation{obs.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-medium">
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                        {unaddressed.length} Unaddressed
                      </span>
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                        {addressed.length} Addressed
                      </span>
                    </div>
                  </div>

                  {isGroupOpen && <div className="divide-y divide-gray-50">
                    {/* Unaddressed section */}
                    {unaddressed.length > 0 && (
                      <div>
                        <div className="px-6 py-2 bg-red-50 border-b border-red-100">
                          <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">Unaddressed ({unaddressed.length})</p>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {unaddressed.map(o => <ObsRow key={o.id as string} o={o} assignmentId={assignmentId} expandedObs={expandedObs} newComment={newComment} setNewComment={setNewComment} savingComment={savingComment} savingExec={savingExec} execResponses={execResponses} canComment={canComment} toggleObs={toggleObs} postComment={postComment} updateStatus={updateStatus} setExecResponses={setExecResponses} setSavingExec={setSavingExec} setGrouped={setGrouped} />)}
                        </div>
                      </div>
                    )}

                    {/* Addressed section */}
                    {addressed.length > 0 && (
                      <div>
                        <div className="px-6 py-2 bg-green-50 border-b border-green-100">
                          <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Addressed ({addressed.length})</p>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {addressed.map(o => <ObsRow key={o.id as string} o={o} assignmentId={assignmentId} expandedObs={expandedObs} newComment={newComment} setNewComment={setNewComment} savingComment={savingComment} savingExec={savingExec} execResponses={execResponses} canComment={canComment} toggleObs={toggleObs} postComment={postComment} updateStatus={updateStatus} setExecResponses={setExecResponses} setSavingExec={setSavingExec} setGrouped={setGrouped} />)}
                        </div>
                      </div>
                    )}
                  </div>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function ObsRow({ o, assignmentId, expandedObs, newComment, setNewComment, savingComment, savingExec, execResponses, canComment, toggleObs, postComment, updateStatus, setExecResponses, setSavingExec, setGrouped }: {
  o: Obs
  assignmentId: string
  expandedObs: Record<string, boolean>
  newComment: Record<string, string>
  setNewComment: React.Dispatch<React.SetStateAction<Record<string, string>>>
  savingComment: string | null
  savingExec: string | null
  execResponses: Record<string, string>
  canComment: boolean
  toggleObs: (id: string, resp: string, o: Obs) => void
  postComment: (id: string, aid: string) => void
  updateStatus: (id: string, status: string, aid: string) => void
  setExecResponses: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setSavingExec: React.Dispatch<React.SetStateAction<string | null>>
  setGrouped: React.Dispatch<React.SetStateAction<{ assignmentId: string; title: string; obs: Obs[] }[]>>
}) {
  const oId = o.id as string
  const isOpen = expandedObs[oId] ?? false
  const comments = (o._comments ?? []) as Comment[]
  const hasComments = comments.length > 0 || !!(o.manager_input as string)

  return (
    <div className="last:border-0">
      <div
        className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 cursor-pointer"
        onClick={() => toggleObs(oId, o.executive_response as string, o)}
      >
        <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors text-gray-400 flex-shrink-0">
          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900">{o.title as string}</p>
          <p className="text-xs text-gray-400 truncate mt-0.5">{o.description as string}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${RISK_COLORS[o.risk_level as string] ?? 'bg-gray-100 text-gray-600'}`}>
            {o.risk_level as string}
          </span>
          {(o.executive_response as string) && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${EXEC_RESP_COLORS[o.executive_response as string] ?? 'bg-gray-100 text-gray-600'}`}>
              {EXEC_RESP_LABELS[o.executive_response as string] ?? o.executive_response as string}
            </span>
          )}
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
            (o.status as string) === 'open' ? 'bg-red-100 text-red-700' :
            (o.status as string) === 'in_progress' ? 'bg-blue-100 text-blue-700' :
            (o.status as string) === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
          }`}>
            {(o.status as string).replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="bg-gray-50 border-t border-gray-100 px-10 py-5 space-y-5">
          {/* Description */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Description</p>
            <p className="text-sm text-gray-700">{o.description as string}</p>
          </div>

          {/* Status update for manager/AM */}
          {canComment && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Update Status</p>
              <select
                value={o.status as string}
                onChange={e => { e.stopPropagation(); updateStatus(oId, e.target.value, assignmentId) }}
                onClick={e => e.stopPropagation()}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          )}

          {/* Comments thread */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Comments / Action Required</p>
            <div className="space-y-2 mb-3">
              {(o.manager_input as string) && (
                <div className="p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-800">{(o.manager_input_by_name as string) || 'Management'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[(o.manager_input_by_role as string)] ?? 'bg-gray-100 text-gray-600'}`}>
                      {((o.manager_input_by_role as string) || 'manager').replace('_', ' ')}
                    </span>
                    {(o.manager_input_at as string) && (
                      <span className="text-xs text-gray-400">· {new Date(o.manager_input_at as string).toLocaleString()}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{o.manager_input as string}</p>
                </div>
              )}
              {!o.manager_input && comments.length === 0 && <p className="text-sm text-gray-400">No comments yet.</p>}
              {comments.map((c: Comment) => (
                <div key={c.id} className="p-3 bg-white border border-gray-200 rounded-lg">
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
              <div onClick={e => e.stopPropagation()}>
                <textarea
                  value={newComment[oId] ?? ''}
                  onChange={e => setNewComment(prev => ({ ...prev, [oId]: e.target.value }))}
                  rows={2}
                  placeholder="Add a comment or action note..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button
                  onClick={() => postComment(oId, assignmentId)}
                  disabled={savingComment === oId || !newComment[oId]?.trim()}
                  className="mt-2 bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingComment === oId ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            )}
          </div>

          {/* Executive acknowledgement */}
          {hasComments && !canComment && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Your Acknowledgement</p>
              <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                <select
                  value={execResponses[oId] ?? (o.executive_response as string) ?? ''}
                  onChange={async e => {
                    const val = e.target.value
                    setExecResponses(prev => ({ ...prev, [oId]: val }))
                    setSavingExec(oId)
                    await supabase.from('observations').update({ executive_response: val }).eq('id', oId)
                    setGrouped(prev => prev.map(g => g.assignmentId === assignmentId ? {
                      ...g,
                      obs: g.obs.map(ob => ob.id === oId ? { ...ob, executive_response: val } : ob)
                    } : g))
                    setSavingExec(null)
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select response —</option>
                  <option value="acknowledged">✓ Acknowledged</option>
                  <option value="in_progress">⏳ Working on it</option>
                  <option value="clarification_needed">❓ Clarification Needed</option>
                  <option value="disagree">✗ Disagree</option>
                </select>
                {savingExec === oId && <span className="text-gray-400 text-sm">Saving...</span>}
                {execResponses[oId] && savingExec !== oId && <span className="text-green-600 text-sm">✓ Saved</span>}
              </div>
            </div>
          )}

          {/* Show exec response to manager/AM */}
          {canComment && (o.executive_response as string) && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Executive Response</p>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${EXEC_RESP_COLORS[o.executive_response as string] ?? 'bg-gray-100 text-gray-700'}`}>
                {EXEC_RESP_LABELS[o.executive_response as string] ?? o.executive_response as string}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
