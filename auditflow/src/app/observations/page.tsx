'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'

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

  useEffect(() => {
    let q = supabase.from('observations').select('*, raiser:profiles(full_name), assignment:assignments(title)').order('created_at', { ascending: false })
    if (riskFilter) q = q.eq('risk_level', riskFilter)
    q.then(({ data }) => { setObs(data ?? []); setLoading(false) })
  }, [riskFilter])

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
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Observation</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assignment</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Risk Level</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Raised By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {obs.map(o => (
                  <tr key={o.id as string} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{o.title as string}</p>
                      <p className="text-sm text-gray-500 truncate max-w-xs">{o.description as string}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{(o.assignment as { title?: string })?.title ?? '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${RISK_COLORS[o.risk_level as string] ?? ''}`}>
                        {o.risk_level as string}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_COLORS[o.status as string] ?? ''}`}>
                        {(o.status as string).replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{(o.raiser as { full_name?: string })?.full_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  )
}
