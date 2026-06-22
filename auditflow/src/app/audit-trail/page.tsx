'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  UPDATE_STATUS: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
}

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (p?.role !== 'manager') { router.replace('/dashboard'); return }
      const { data } = await supabase.from('audit_logs')
        .select('*, user:profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(20)
      setLogs(data ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Audit Trail</h1>
        <p className="text-gray-500 mb-8">Complete log of all system actions</p>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No audit logs yet</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Entity</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(log => (
                  <tr key={log.id as string} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(log.created_at as string).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-900">
                      {(log.user as { full_name?: string })?.full_name ?? 'System'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action as string] ?? 'bg-gray-100 text-gray-700'}`}>
                        {log.action as string}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 capitalize">
                      {(log.entity_type as string).replace('_', ' ')}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {Object.entries(log.details as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}
                    </td>
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
