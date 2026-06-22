'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/auth'

function NewObservationForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [userId, setUserId] = useState('')
  const [assignments, setAssignments] = useState<{ id: string; title: string }[]>([])
  const [form, setForm] = useState({
    assignment_id: searchParams.get('assignment') ?? '',
    title: '',
    description: '',
    risk_level: 'medium',
    status: 'open',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) })
    supabase.from('assignments').select('id, title').then(({ data }) => setAssignments(data ?? []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data, error: err } = await supabase.from('observations').insert({ ...form, raised_by: userId }).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    await logAction(userId, 'CREATE', 'observation', data.id, { title: form.title, risk_level: form.risk_level })
    router.push('/observations')
  }

  return (
    <AppShell>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">New Observation</h1>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Observation Title *</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Brief title of the finding" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Detailed description of the observation, evidence, and impact..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level *</label>
              <select value={form.risk_level} onChange={e => setForm({ ...form, risk_level: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Observation'}
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

export default function NewObservationPage() {
  return <Suspense fallback={<AppShell><div>Loading...</div></AppShell>}><NewObservationForm /></Suspense>
}
