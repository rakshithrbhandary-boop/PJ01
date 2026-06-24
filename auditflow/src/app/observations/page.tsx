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
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
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
type Obs = Record<string, unknown>

export default function ObservationsPage() {
  const [obs, setObs] = useState<Obs[]>([])
  const [loading, setLoading] = useState(true)
  const [riskFilter, setRiskFilter] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [commentsByObs, setCommentsByObs] = useState<Record<string, Comment[]>>({})
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({})
  const [newComment, setNewComment] = useState<Record<string, string>>({})
  const [savingComment, setSavingComment] = useState<string | null>(null)
  const [execResponses, setExecResponses] = useState<Record<string, string>>({})
  const [savingExec, setSavingExec] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(p)
      }
    })
  }, [])

  useEffect(() => {
    async function fetchObs() {
      setLoading(true)
      let q = supabase.from('observations').select('*').order('created_at', { ascending: false })
      if (riskFilter) q = q.eq('risk_level', riskFilter)
      const { data: obsData } = await q
      if (!obsData) { setLoading(false); return }

      const raisedByIds = [...new Set(obsData.map(o => o.raised_by).filter(Boolean))]
      const assignmentIds = [...new Set(obsData.map(o => o.assignment_id).filter(Boolean))]
      const [{ data: profilesData }, { data: assignmentsData }] = await Promise.all([
        raisedByIds.length > 0 ? supabase.from('profiles').select('id, full_name').in('id', raisedByIds as string[]) : Promise.resolve({ data: [] }),
        assignmentIds.length > 0 ? supabase.from('assignments').select('id, title').in('id', assignmentIds as string[]) : Promise.resolve({ data: [] }),
      ])
      const profileMap = Object.fromEntries((profilesData ?? []).map(p => [p.id, p.full_name]))
      const assignmentMap = Object.fromEntries((assignmentsData ?? []).map(a => [a.id, a.title]))
      setObs(obsData.map(o => ({
        ...o,
        _raisedByName: profileMap[o.raised_by as string] ?? '—',
        _assignmentTitle: assignmentMap[o.assignment_id as string] ?? '—',
      })))
      setLoading(false)
    }
    fetchObs()
  }, [riskFilter])

  async function toggleExpand(oId: string, execResponse: string) {
    const isOpen = expanded[oId]
    setExpanded(prev => ({ ...prev, [oId]: !isOpen }))
    setExecResponses(prev => ({ ...prev, [oId]: prev[oId] ?? execResponse ?? '' }))
    if (!isOpen && !commentsByObs[oId]) {
      setLoadingComments(prev => ({ ...prev, [oId]: true }))
      const { data } = await supabase.from('observation_comments').select('*').eq('observation_id', oId).order('created_at')
      setCommentsByObs(prev => ({ ...prev, [oId]: (data ?? []) as Comment[] }))
      setLoadingComments(prev => ({ ...prev, [oId]: false }))
    }
  }

  async function postComment(oId: string) {
    if (!profile || !newComment[oId]?.trim()) return
    setSavingComment(oId)
    const { data } = await supabase.from('observation_comments').insert({
      observation_id: oId,
      comment: newComment[oId].trim(),
      commenter_name: profile.full_name,
      commenter_role: profile.role,
    }).select().single()
    if (data) setCommentsByObs(prev => ({ ...prev, [oId]: [...(prev[oId] ?? []), data as Comment] }))
    setNewComment(prev => ({ ...prev, [oId]: '' }))
    setSavingComment(null)
  }

  async function updateStatus(oId: string, status: string) {
    setUpdatingStatus(oId)
    await supabase.from('observations').update({ status }).eq('id', oId)
    setObs(prev => prev.map(o => o.id === oId ? { ...o, status } : o))
    setUpdatingStatus(null)
  }

  const isManager = profile?.role === 'manager'
  const isAM = profile?.role === 'assistant_manager'
  const canComment = isManager || isAM

  return (
    <AppShell>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Observations</h1>
            <p className="text-gray-500 mt-1">Track audit findings and risk observations</p>
          </div>
          <Link href="/observations/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
            + New Observation
          </Link>
        </div>

        {/* Risk filter */}
        <div className="mb-4 flex gap-2">
          {['', 'low', 'medium', 'high', 'critical'].map(r => (
            <button key={r} onClick={() => setRiskFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                riskFilter === r ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}>
              {r === '' ? 'All Risk' : r}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : obs.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No observations found.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-8 px-3 py-3" />
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Observation</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Assignment</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Risk</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Raised By</th>
                </tr>
              </thead>
              <tbody>
                {obs.map(o => {
                  const oId = o.id as string
                  const isOpen = expanded[oId] ?? false
                  const comments = commentsByObs[oId] ?? []
                  const hasComments = comments.length > 0 || !!(o.manager_input as string)

                  return (
                    <>
                      <tr key={oId} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-4">
                          <button onClick={() => toggleExpand(oId, o.executive_response as string)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors text-gray-400">
                            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <Link href={`/observations/${oId}`} className="font-medium text-gray-900 hover:text-blue-600">
                            {o.title as string}
                          </Link>
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{o.description as string}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{o._assignmentTitle as string}</td>
                        <td className="px-4 py-4">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${RISK_COLORS[o.risk_level as string] ?? 'bg-gray-100'}`}>
                            {o.risk_level as string}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {canComment ? (
                            <select value={o.status as string} onChange={e => updateStatus(oId, e.target.value)}
                              disabled={updatingStatus === oId}
                              className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[o.status as string] ?? 'bg-gray-100'}`}>
                              <option value="open">Open</option>
                              <option value="in_progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                              <option value="closed">Closed</option>
                            </select>
                          ) : (
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_COLORS[o.status as string] ?? 'bg-gray-100'}`}>
                              {(o.status as string).replace(/_/g, ' ')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{o._raisedByName as string}</td>
                      </tr>

                      {isOpen && (
                        <tr key={`${oId}-detail`} className="bg-gray-50 border-t border-gray-100">
                          <td />
                          <td colSpan={5} className="px-4 py-5">
                            {loadingComments[oId] ? (
                              <p className="text-xs text-gray-400">Loading...</p>
                            ) : (
                              <div className="space-y-4">
                                {/* Description */}
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</p>
                                  <p className="text-sm text-gray-700">{o.description as string}</p>
                                </div>

                                {/* Executive response badge (for manager/AM) */}
                                {canComment && (o.executive_response as string) && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Executive Response</p>
                                    <span className={`text-xs font-medium px-3 py-1 rounded-full ${EXEC_RESP_COLORS[o.executive_response as string] ?? 'bg-gray-100'}`}>
                                      {EXEC_RESP_LABELS[o.executive_response as string] ?? o.executive_response as string}
                                    </span>
                                  </div>
                                )}

                                {/* Comments */}
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Comments / Action Required</p>
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
                                    {!o.manager_input && comments.length === 0 && (
                                      <p className="text-sm text-gray-400">No comments yet.</p>
                                    )}
                                    {comments.map(c => (
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
                                      <textarea value={newComment[oId] ?? ''} onChange={e => setNewComment(prev => ({ ...prev, [oId]: e.target.value }))}
                                        rows={2} placeholder="Add a comment or action note..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                                      <button onClick={() => postComment(oId)} disabled={savingComment === oId || !newComment[oId]?.trim()}
                                        className="mt-2 bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                                        {savingComment === oId ? 'Posting...' : 'Post Comment'}
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Executive acknowledgement */}
                                {hasComments && !canComment && (
                                  <div className="border-t border-gray-200 pt-3">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Your Acknowledgement</p>
                                    <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                                      <select value={execResponses[oId] ?? (o.executive_response as string) ?? ''}
                                        onChange={async e => {
                                          const val = e.target.value
                                          setExecResponses(prev => ({ ...prev, [oId]: val }))
                                          setSavingExec(oId)
                                          await supabase.from('observations').update({ executive_response: val }).eq('id', oId)
                                          setObs(prev => prev.map(ob => ob.id === oId ? { ...ob, executive_response: val } : ob))
                                          setSavingExec(null)
                                        }}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                        <option value="">— Select response —</option>
                                        <option value="acknowledged">✓ Acknowledged & In Progress</option>
                                        <option value="clarification_needed">⏳ Clarification Pending from Management</option>
                                        <option value="disagree">✔ Completed</option>
                                      </select>
                                      {savingExec === oId && <span className="text-gray-400 text-sm">Saving...</span>}
                                      {execResponses[oId] && savingExec !== oId && <span className="text-green-600 text-sm">✓ Saved</span>}
                                    </div>
                                  </div>
                                )}

                                {/* Link to full detail */}
                                <div className="pt-1">
                                  <Link href={`/observations/${oId}`} className="text-xs text-blue-600 hover:underline font-medium">
                                    View full observation →
                                  </Link>
                                </div>
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
