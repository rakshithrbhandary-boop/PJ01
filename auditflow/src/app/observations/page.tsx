'use client'
import { useEffect, useState } from 'react'
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

export default function ObservationsPage() {
  const [obs, setObs] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [riskFilter, setRiskFilter] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [managerInputs, setManagerInputs] = useState<Record<string, string>>({})
  const [savingInput, setSavingInput] = useState<string | null>(null)
  const [savedInput, setSavedInput] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(p)
      }
    })
  }, [])

  useEffect(() => {
    let q = supabase.from('observations')
      .select('*, raiser:profiles(full_name), assignment:assignments(title)')
      .order('created_at', { ascending: false })
    if (riskFilter) q = q.eq('risk_level', riskFilter)
    q.then(({ data }) => { setObs(data ?? []); setLoading(false) })
  }, [riskFilter])

  function toggle(id: string, currentInput: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    setManagerInputs(prev => ({ ...prev, [id]: prev[id] ?? currentInput ?? '' }))
  }

  async function saveManagerInput(obsId: string) {
    setSavingInput(obsId)
    await supabase.from('observations').update({ manager_input: managerInputs[obsId] }).eq('id', obsId)
    setObs(prev => prev.map(o => o.id === obsId ? { ...o, manager_input: managerInputs[obsId] } : o))
    setSavingInput(null)
    setSavedInput(obsId)
    setTimeout(() => setSavedInput(null), 2000)
  }

  async function updateStatus(obsId: string, status: string) {
    await supabase.from('observations').update({ status }).eq('id', obsId)
    setObs(prev => prev.map(o => o.id === obsId ? { ...o, status } : o))
  }

  const isManager = profile?.role === 'manager'

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
          {loading ? <div className="py-12 text-center text-gray-400">Loading...</div>
          : obs.length === 0 ? <div className="py-12 text-center text-gray-400">No observations found</div>
          : (
            <div>
              <div className="grid grid-cols-[40px_1fr_180px_120px_110px_120px] bg-gray-50 border-b border-gray-100 px-4 py-3">
                <div />
                <div className="text-xs font-medium text-gray-500 uppercase">Observation</div>
                <div className="text-xs font-medium text-gray-500 uppercase">Assignment</div>
                <div className="text-xs font-medium text-gray-500 uppercase">Risk Level</div>
                <div className="text-xs font-medium text-gray-500 uppercase">Status</div>
                <div className="text-xs font-medium text-gray-500 uppercase">Raised By</div>
              </div>
              {obs.map(o => {
                const isOpen = expanded === (o.id as string)
                return (
                  <div key={o.id as string} className="border-b border-gray-50 last:border-0">
                    {/* Row */}
                    <div
                      className="grid grid-cols-[40px_1fr_180px_120px_110px_120px] px-4 py-4 items-center hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggle(o.id as string, o.manager_input as string)}
                    >
                      <div className="flex items-center justify-center">
                        <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors text-gray-400">
                          <svg
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{o.title as string}</p>
                        <p className="text-xs text-gray-400 truncate max-w-xs">{o.description as string}</p>
                      </div>
                      <div className="text-sm text-gray-500">{(o.assignment as { title?: string })?.title ?? '—'}</div>
                      <div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${RISK_COLORS[o.risk_level as string] ?? ''}`}>
                          {o.risk_level as string}
                        </span>
                      </div>
                      <div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_COLORS[o.status as string] ?? ''}`}>
                          {(o.status as string).replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">{(o.raiser as { full_name?: string })?.full_name ?? '—'}</div>
                    </div>

                    {/* Expanded Panel */}
                    {isOpen && (
                      <div className="bg-gray-50 border-t border-gray-100 px-10 py-5 space-y-5">
                        {/* Full description */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Description</p>
                          <p className="text-sm text-gray-700">{o.description as string}</p>
                        </div>

                        {/* Status + Risk controls for manager */}
                        {isManager && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Update Status</p>
                              <select
                                value={o.status as string}
                                onChange={e => { e.stopPropagation(); updateStatus(o.id as string, e.target.value) }}
                                onClick={e => e.stopPropagation()}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="open">Open</option>
                                <option value="in_progress">In Progress</option>
                                <option value="resolved">Resolved</option>
                                <option value="closed">Closed</option>
                              </select>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Risk Level</p>
                              <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full capitalize mt-1 ${RISK_COLORS[o.risk_level as string] ?? ''}`}>
                                {o.risk_level as string}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Manager input section */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                            {isManager ? 'Manager Comments / Action Required' : 'Manager Comments'}
                          </p>
                          {isManager ? (
                            <>
                              <textarea
                                value={managerInputs[o.id as string] ?? ''}
                                onChange={e => setManagerInputs(prev => ({ ...prev, [o.id as string]: e.target.value }))}
                                onClick={e => e.stopPropagation()}
                                rows={3}
                                placeholder="Add action required, management response, or follow-up notes..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                              />
                              <div className="flex items-center gap-3 mt-2">
                                <button
                                  onClick={e => { e.stopPropagation(); saveManagerInput(o.id as string) }}
                                  disabled={savingInput === (o.id as string)}
                                  className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {savingInput === (o.id as string) ? 'Saving...' : 'Save'}
                                </button>
                                {savedInput === (o.id as string) && <span className="text-green-600 text-sm">✓ Saved</span>}
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-gray-600">{(o.manager_input as string) || <span className="text-gray-400">No comments yet.</span>}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
