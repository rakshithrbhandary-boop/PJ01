'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/auth'

export default function TimesheetsPage() {
  const [entries, setEntries] = useState<Record<string, unknown>[]>([])
  const [assignments, setAssignments] = useState<{ id: string; title: string }[]>([])
  const [tasks, setTasks] = useState<{ id: string; title: string; assignment_id: string }[]>([])
  const [userId, setUserId] = useState('')
  const [form, setForm] = useState({ assignment_id: '', task_id: '', date: new Date().toISOString().slice(0, 10), hours: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) })
    supabase.from('assignments').select('id, title').then(({ data }) => setAssignments(data ?? []))
    supabase.from('tasks').select('id, title, assignment_id').then(({ data }) => setTasks(data ?? []))
    loadEntries()
  }, [])

  async function loadEntries() {
    const { data } = await supabase.from('timesheet_entries')
      .select('*, user:profiles(full_name), assignment:assignments(title)')
      .order('date', { ascending: false }).limit(50)
    setEntries(data ?? [])
  }

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
    loadEntries()
  }

  const filteredTasks = tasks.filter(t => t.assignment_id === form.assignment_id)
  const totalHours = entries.reduce((sum, e) => sum + (e.hours as number), 0)

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Timesheets</h1>
        <p className="text-gray-500 mb-8">Log and track time spent on assignments</p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <p className="text-gray-500 text-sm">Total Hours Logged</p>
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
            <h2 className="font-semibold text-gray-900 mb-4">Recent Entries</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {entries.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">No entries yet</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {entries.map(e => (
                    <div key={e.id as string} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{(e.assignment as { title?: string })?.title}</p>
                        <p className="text-xs text-gray-500">{e.date as string} · {(e.user as { full_name?: string })?.full_name}</p>
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
