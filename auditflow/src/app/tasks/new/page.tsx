'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/auth'

function NewTaskForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [userId, setUserId] = useState('')
  const [assignments, setAssignments] = useState<{ id: string; title: string }[]>([])
  const [members, setMembers] = useState<{ id: string; full_name: string }[]>([])
  const [form, setForm] = useState({
    assignment_id: searchParams.get('assignment') ?? '',
    title: '',
    description: '',
    assigned_to: '',
    priority: 'medium',
    due_date: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) })
    supabase.from('assignments').select('id, title').then(({ data }) => setAssignments(data ?? []))
    supabase.from('profiles').select('id, full_name').then(({ data }) => setMembers(data ?? []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data, error: err } = await supabase.from('tasks').insert(form).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    await logAction(userId, 'CREATE', 'task', data.id, { title: form.title })
    router.push(`/tasks/${data.id}`)
  }

  return (
    <AppShell>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">New Task</h1>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignment *</label>
            <select required value={form.assignment_id} onChange={e => setForm({ ...form, assignment_id: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select assignment</option>
              {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Title *</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Review bank reconciliation" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign To *</label>
              <select required value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select member</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
            <input required type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Task details and scope..." />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Task'}
            </button>
            <button type="button" onClick={() => router.back()} className="text-gray-600 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}

export default function NewTaskPage() {
  return <Suspense fallback={<AppShell><div>Loading...</div></AppShell>}><NewTaskForm /></Suspense>
}
