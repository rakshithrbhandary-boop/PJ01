'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/auth'
import type { Profile } from '@/lib/supabase'

export default function TimesheetsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [entries, setEntries] = useState<Record<string, unknown>[]>([])
  const [assignments, setAssignments] = useState<{ id: string; title: string }[]>([])
  const [tasks, setTasks] = useState<{ id: string; title: string; assignment_id: string }[]>([])
  const [userId, setUserId] = useState('')
  const [form, setForm] = useState({ assignment_id: '', task_id: '', date: new Date().toISOString().slice(0, 10), hours: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)

      const isManager = p?.role === 'manager'

      if (isManager) {
        // Manager: load all entries with person + assignment info
        const { data } = await supabase.from('timesheet_entries')
          .select('*, user:profiles(full_name), assignment:assignments(title)')
          .order('date', { ascending: false })
        setEntries(data ?? [])
      } else {
        // Others: load only their own entries
        const { data } = await supabase.from('timesheet_entries')
          .select('*, assignment:assignments(title)')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
        setEntries(data ?? [])

        // Load only their visible assignments and tasks for the form
        const { data: asgn } = await supabase.from('assignments').select('id, title')
        setAssignments(asgn ?? [])
        const { data: tsk } = await supabase.from('tasks').select('id, title, assignment_id').eq('assigned_to', user.id)
        setTasks(tsk ?? [])
      }
    }
    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data, error: err } = await supabase.from('timesheet_entries').insert({
      user_id: userId,
      assignment_id: form.assignment_id,
      task_id: form.task_id || null,
      date: form.date,
      hours: parseFloat(form.hours),
      description: form.description || null,
    }).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    await logAction(userId, 'CREATE', 'timesheet_entry', data.id, { hours: form.hours, date: form.date })
    setForm({ assignment_id: '', task_id: '', date: new Date().toISOString().slice(0, 10), hours: '', description: '' })
    setSaving(false)
    // Refresh own entries
    const { data: refreshed } = await supabase.from('timesheet_entries')
      .select('*, assignment:assignments(title)')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    setEntries(refreshed ?? [])
  }

  const isManager = profile?.role === 'manager'
  const filteredTasks = tasks.filter(t => t.assignment_id === form.assignment_id)
  const totalHours = entries.reduce((sum, e) => sum + (e.hours as number), 0)

  // Manager: group entries by person then by assignment
  const grouped: Record<string, { name: string; assignments: Record<string, { title: string; hours: number; entries: Record<string, unknown>[] }> }> = {}
  if (isManager) {
    entries.forEach(e => {
      const uid = e.user_id as string
      const name = (e.user as { full_name?: string })?.full_name ?? 'Unknown'
      const aId = e.assignment_id as string
      const aTitle = (e.assignment as { title?: string })?.title ?? 'Unknown'
      if (!grouped[uid]) grouped[uid] = { name, assignments: {} }
      if (!grouped[uid].assignments[aId]) grouped[uid].assignments[aId] = { title: aTitle, hours: 0, entries: [] }
      grouped[uid].assignments[aId].hours += e.hours as number
      grouped[uid].assignments[aId].entries.push(e)
    })
  }

  if (isManager) {
    return (
      <AppShell>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Timesheet Overview</h1>
          <p className="text-gray-500 mb-6">Time logged by each team member per assignment</p>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <p className="text-gray-500 text-sm">Total Hours (All)</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{totalHours.toFixed(1)}</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <p className="text-gray-500 text-sm">Total Entries</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{entries.length}</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <p className="text-gray-500 text-sm">Team Members</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{Object.keys(grouped).length}</p>
            </div>
          </div>

          {Object.keys(grouped).length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center text-gray-400">No timesheet entries yet.</div>
          ) : (
            <div className="space-y-6">
              {Object.values(grouped).map(person => {
                const personTotal = Object.values(person.assignments).reduce((s, a) => s + a.hours, 0)
                return (
                  <div key={person.name} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          {person.name[0]?.toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-900">{person.name}</span>
                      </div>
                      <span className="text-sm font-medium text-blue-600">{personTotal.toFixed(1)}h total</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {Object.values(person.assignments).map(asgn => (
                        <div key={asgn.title} className="px-6 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{asgn.title}</p>
                            <p className="text-xs text-gray-400">{asgn.entries.length} entr{asgn.entries.length !== 1 ? 'ies' : 'y'}</p>
                          </div>
                          <span className="text-sm font-semibold text-gray-700">{asgn.hours.toFixed(1)}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">My Timesheets</h1>
        <p className="text-gray-500 mb-8">Log and track your time</p>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <p className="text-gray-500 text-sm">My Total Hours</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{totalHours.toFixed(1)}</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <p className="text-gray-500 text-sm">Total Entries</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{entries.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Log Time</h2>
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assignment *</label>
                <select required value={form.assignment_id} onChange={e => setForm({ ...form, assignment_id: e.target.value, task_id: '' })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select assignment</option>
                  {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </div>
              {filteredTasks.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Task (optional)</label>
                  <select value={form.task_id} onChange={e => setForm({ ...form, task_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">No specific task</option>
                    {filteredTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours *</label>
                  <input required type="number" step="0.5" min="0.5" max="24" value={form.hours}
                    onChange={e => setForm({ ...form, hours: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 2.5" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="What did you work on?" />
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Logging...' : 'Log Time'}
              </button>
            </form>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-4">My Recent Entries</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {entries.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">No entries yet</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {entries.map(e => (
                    <div key={e.id as string} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{(e.assignment as { title?: string })?.title}</p>
                        <p className="text-xs text-gray-500">{e.date as string}</p>
                        {(e.description as string | undefined) && <p className="text-xs text-gray-400 mt-0.5">{e.description as string}</p>}
                      </div>
                      <span className="text-sm font-semibold text-blue-600">{e.hours as number}h</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
