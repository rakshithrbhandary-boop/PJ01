'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'

interface Stats {
  totalAssignments: number
  activeAssignments: number
  totalTasks: number
  overdueTasks: number
  openObservations: number
  criticalObservations: number
}

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <p className="text-gray-500 text-sm">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalAssignments: 0, activeAssignments: 0,
    totalTasks: 0, overdueTasks: 0,
    openObservations: 0, criticalObservations: 0
  })
  const [recentAssignments, setRecentAssignments] = useState<{ id: string; title: string; status: string; type: string; due_date: string }[]>([])

  useEffect(() => {
    async function load() {
      const [
        { count: totalA },
        { count: activeA },
        { count: totalT },
        { count: overdueT },
        { count: openO },
        { count: critO },
        { data: recent }
      ] = await Promise.all([
        supabase.from('assignments').select('*', { count: 'exact', head: true }),
        supabase.from('assignments').select('*', { count: 'exact', head: true }).in('status', ['in_progress', 'planning']),
        supabase.from('tasks').select('*', { count: 'exact', head: true }),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
        supabase.from('observations').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
        supabase.from('observations').select('*', { count: 'exact', head: true }).eq('risk_level', 'critical'),
        supabase.from('assignments').select('id, title, status, type, due_date').order('created_at', { ascending: false }).limit(5)
      ])
      setStats({
        totalAssignments: totalA ?? 0, activeAssignments: activeA ?? 0,
        totalTasks: totalT ?? 0, overdueTasks: overdueT ?? 0,
        openObservations: openO ?? 0, criticalObservations: critO ?? 0
      })
      setRecentAssignments(recent ?? [])
    }
    load()
  }, [])

  const statusColors: Record<string, string> = {
    planning: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    review: 'bg-purple-100 text-purple-800',
    completed: 'bg-green-100 text-green-800',
    on_hold: 'bg-gray-100 text-gray-800',
  }

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-500 mb-8">Overview of all audit activities</p>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <StatCard label="Total Assignments" value={stats.totalAssignments} color="text-gray-900" />
          <StatCard label="Active Assignments" value={stats.activeAssignments} sub="In progress / Planning" color="text-blue-600" />
          <StatCard label="Total Tasks" value={stats.totalTasks} color="text-gray-900" />
          <StatCard label="Overdue Tasks" value={stats.overdueTasks} sub="Requires attention" color="text-red-600" />
          <StatCard label="Open Observations" value={stats.openObservations} color="text-orange-600" />
          <StatCard label="Critical Risks" value={stats.criticalObservations} sub="Critical observations" color="text-red-600" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Assignments</h2>
          </div>
          {recentAssignments.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">
              No assignments yet. <a href="/assignments" className="text-blue-600 hover:underline">Create one</a>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentAssignments.map(a => (
                <div key={a.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <a href={`/assignments/${a.id}`} className="font-medium text-gray-900 hover:text-blue-600">{a.title}</a>
                    <p className="text-sm text-gray-500 capitalize">{a.type.replace(/_/g, ' ')} · Due {a.due_date}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[a.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {a.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
