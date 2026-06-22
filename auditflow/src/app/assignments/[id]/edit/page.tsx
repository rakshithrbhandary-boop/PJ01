'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/auth'

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'fieldwork', label: 'Fieldwork' },
  { value: 'data_collection', label: 'Data Collection' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'pending_clarification', label: 'Pending Clarification' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
]

export default function EditAssignmentPage() {
  const router = useRouter()
  const { id } = useParams()
  const [userId, setUserId] = useState('')
  const [assistantManagers, setAssistantManagers] = useState<{ id: string; full_name: string }[]>([])
  const [form, setForm] = useState({
    title: '', type: 'internal_audit', status: 'planning',
    client_name: '', start_date: '', due_date: '', description: '', assigned_to: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) })
    supabase.from('profiles').select('id, full_name').eq('role', 'assistant_manager')
      .then(({ data }) => setAssistantManagers(data ?? []))
    supabase.from('assignments').select('*').eq('id', id as string).single().then(({ data }) => {
      if (data) setForm({
        title: data.title, type: data.type, status: data.status,
        client_name: data.client_name, start_date: data.start_date,
        due_date: data.due_date, description: data.description ?? '',
        assigned_to: data.assigned_to ?? '',
      })
      setLoading(false)
    })
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, assigned_to: form.assigned_to || null }
    const { error: err } = await supabase.from('assignments').update(payload).eq('id', id as string)
    if (err) { setError(err.message); setSaving(false); return }
    await logAction(userId, 'UPDATE', 'assignment', id as string, { title: form.title })
    router.push(`/assignments/${id}`)
  }

  if (loading) return <AppShell><div className="py-12 text-center text-gray-400">Loading...</div></AppShell>

  return (
    <AppShell>
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Edit Assignment</h1>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Title *</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="internal_audit">Internal Audit</option>
                <option value="concurrent_audit">Concurrent Audit</option>
                <option value="process_consulting">Process Consulting</option>
                <option value="due_diligence">Due Diligence</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
            <input required value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Assistant Manager</label>
            <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Unassigned —</option>
              {assistantManagers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input required type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
              <input required type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => router.back()}
              className="text-gray-600 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-100">Cancel</button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
