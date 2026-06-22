'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'

export default function ReportsPage() {
  const [assignmentsByType, setAssignmentsByType] = useState<Record<string, number>>({})
  const [tasksByStatus, setTasksByStatus] = useState<Record<string, number>>({})
  const [obsByRisk, setObsByRisk] = useState<Record<string, number>>({})
  const [hoursByAssignment, setHoursByAssignment] = useState<{ title: string; hours: number }[]>([])

  useEffect(() => {
    async function load() {
      const [{ data: assignments }, { data: tasks }, { data: obs }, { data: timesheets }] = await Promise.all([
        supabase.from('assignments').select('type'),
        supabase.from('tasks').select('status'),
        supabase.from('observations').select('risk_level'),
        supabase.from('timesheet_entries').select('hours, assignment:assignments(title)'),
      ])

      const aByType: Record<string, number> = {}
      assignments?.forEach(a => { aByType[a.type] = (aByType[a.type] ?? 0) + 1 })
      setAssignmentsByType(aByType)

      const tByStatus: Record<string, number> = {}
      tasks?.forEach(t => { tByStatus[t.status] = (tByStatus[t.status] ?? 0) + 1 })
      setTasksByStatus(tByStatus)

      const oByRisk: Record<string, number> = {}
      obs?.forEach(o => { oByRisk[o.risk_level] = (oByRisk[o.risk_level] ?? 0) + 1 })
      setObsByRisk(oByRisk)

      const hByA: Record<string, number> = {}
      timesheets?.forEach((t: Record<string, unknown>) => {
        const title = (t.assignment as { title?: string })?.title ?? 'Unknown'
        hByA[title] = (hByA[title] ?? 0) + (t.hours as number)
      })
      setHoursByAssignment(Object.entries(hByA).map(([title, hours]) => ({ title, hours })).sort((a, b) => b.hours - a.hours))
    }
    load()
  }, [])

  const typeLabels: Record<string, string> = {
    internal_audit: 'Internal Audit', concurrent_audit: 'Concurrent Audit',
    process_consulting: 'Process Consulting', due_diligence: 'Due Diligence'
  }

  function Bar({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = max > 0 ? (value / max) * 100 : 0
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-gray-100 rounded-full h-3">
          <div className={`h-3 rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-medium text-gray-900 w-6">{value}</span>
      </div>
    )
  }

  const maxA = Math.max(...Object.values(assignmentsByType), 1)
  const maxT = Math.max(...Object.values(tasksByStatus), 1)
  const maxO = Math.max(...Object.values(obsByRisk), 1)
  const maxH = Math.max(...hoursByAssignment.map(h => h.hours), 1)

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Reports</h1>
        <p className="text-gray-500 mb-8">Analytics and performance overview</p>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-4">Assignments by Type</h3>
            <div className="space-y-3">
              {Object.entries(assignmentsByType).map(([type, count]) => (
                <div key={type}>
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>{typeLabels[type] ?? type}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <Bar value={count} max={maxA} color="bg-blue-500" />
                </div>
              ))}
              {Object.keys(assignmentsByType).length === 0 && <p className="text-gray-400 text-sm">No data yet</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-4">Tasks by Status</h3>
            <div className="space-y-3">
              {[['not_started', 'bg-gray-400'], ['in_progress', 'bg-blue-500'], ['completed', 'bg-green-500'], ['overdue', 'bg-red-500']].map(([s, c]) => (
                tasksByStatus[s] !== undefined && (
                  <div key={s}>
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span className="capitalize">{s.replace('_', ' ')}</span>
                      <span className="font-medium">{tasksByStatus[s]}</span>
                    </div>
                    <Bar value={tasksByStatus[s]} max={maxT} color={c} />
                  </div>
                )
              ))}
              {Object.keys(tasksByStatus).length === 0 && <p className="text-gray-400 text-sm">No data yet</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-4">Observations by Risk Level</h3>
            <div className="space-y-3">
              {[['critical', 'bg-red-500'], ['high', 'bg-orange-500'], ['medium', 'bg-yellow-500'], ['low', 'bg-green-500']].map(([r, c]) => (
                obsByRisk[r] !== undefined && (
                  <div key={r}>
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span className="capitalize">{r}</span>
                      <span className="font-medium">{obsByRisk[r]}</span>
                    </div>
                    <Bar value={obsByRisk[r]} max={maxO} color={c} />
                  </div>
                )
              ))}
              {Object.keys(obsByRisk).length === 0 && <p className="text-gray-400 text-sm">No data yet</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-4">Hours by Assignment</h3>
            <div className="space-y-3">
              {hoursByAssignment.slice(0, 6).map(({ title, hours }) => (
                <div key={title}>
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span className="truncate max-w-[200px]">{title}</span>
                    <span className="font-medium">{hours.toFixed(1)}h</span>
                  </div>
                  <Bar value={hours} max={maxH} color="bg-indigo-500" />
                </div>
              ))}
              {hoursByAssignment.length === 0 && <p className="text-gray-400 text-sm">No timesheet data yet</p>}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
