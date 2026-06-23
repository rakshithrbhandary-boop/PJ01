'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/auth'
import AssignmentTypeSelect from '@/components/AssignmentTypeSelect'

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

const FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Half-yearly', 'Annually']

type Scope = { name: string; verification_frequency: string; reporting_frequency: string }

export default function NewAssignmentPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [assistantManagers, setAssistantManagers] = useState<{ id: string; full_name: string }[]>([])
  const [form, setForm] = useState({
    title: '', type: 'internal_audit', status: 'planning',
    client_name: '', start_date: '', due_date: '', description: '',
    assigned_to: '',
  })
  const [isDailyAudit, setIsDailyAudit] = useState(false)
  const [alwaysActive, setAlwaysActive] = useState(false)
  const [scopes, setScopes] = useState<Scope[]>([{ name: '', verification_frequency: 'Daily', reporting_frequency: 'Daily' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) })
    supabase.from('profiles').select('id, full_name').eq('role', 'assistant_manager')
      .then(({ data }) => setAssistantManagers(data ?? []))
  }, [])

  function handleTypeChange(v: string) {
    setForm({ ...form, type: v })
    setIsDailyAudit(v.toLowerCase().includes('daily') || v.toLowerCase().includes('concurrent'))
  }

  function addScope() {
    setScopes(prev => [...prev, { name: '', verification_frequency: 'Daily', reporting_frequency: 'Daily' }])
  }

  function updateScope(i: number, field: keyof Scope, value: string) {
    setScopes(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  function removeScope(i: number) {
    setScopes(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      ...form,
      manager_id: userId,
      assigned_to: form.assigned_to || null,
      daily_audit_scopes: isDailyAudit ? scopes.filter(s => s.name.trim()) : null,
      always_active: alwaysActive,
      due_date: alwaysActive ? null : form.due_date,
    }
    const { data, error: err } = await supabase.from('assignments').insert(payload).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    await logAction(userId, 'CREATE', 'assignment', data.id, { title: form.title })
    router.push(`/assignments/${data.id}`)
  }

  return (
    <AppShell>
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">New Assignment</h1>
          <p className="text-gray-500 mt-1">Create a new audit engagement</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Title *</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. ABC Corp Internal Audit FY2025" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <AssignmentTypeSelect value={form.type} onChange={handleTypeChange} />
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
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Client organization name" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Assistant Manager</label>
            <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Unassigned —</option>
              {assistantManagers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">The assigned assistant manager can then allocate tasks to executives.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input required type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Due Date {!alwaysActive && '*'}</label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-500 select-none">
                  <input type="checkbox" checked={alwaysActive} onChange={e => setAlwaysActive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded" />
                  Always Active
                </label>
              </div>
              <input
                required={!alwaysActive}
                disabled={alwaysActive}
                type="date"
                value={alwaysActive ? '' : form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })}
                className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${alwaysActive ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300'}`}
              />
              {alwaysActive && <p className="text-xs text-blue-600 mt-1">This assignment has no end date.</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Assignment scope and objectives..." />
          </div>

          {/* Daily Audit Scopes */}
          {isDailyAudit && (
            <div className="border border-blue-100 rounded-xl p-4 bg-blue-50 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-900">Daily Audit Scopes</p>
                  <p className="text-xs text-blue-600 mt-0.5">Define each area to be audited with its verification and reporting frequencies</p>
                </div>
                <button type="button" onClick={addScope}
                  className="text-sm text-blue-700 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium">
                  + Add Scope
                </button>
              </div>
              {scopes.map((scope, i) => (
                <div key={i} className="bg-white rounded-lg border border-blue-100 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Scope {i + 1}</p>
                    {scopes.length > 1 && (
                      <button type="button" onClick={() => removeScope(i)}
                        className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    )}
                  </div>
                  <input
                    value={scope.name}
                    onChange={e => updateScope(i, 'name', e.target.value)}
                    placeholder="Scope name (e.g. Cash Vouching, Stock Verification)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Verification Frequency</label>
                      <select value={scope.verification_frequency} onChange={e => updateScope(i, 'verification_frequency', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Reporting Frequency</label>
                      <select value={scope.reporting_frequency} onChange={e => updateScope(i, 'reporting_frequency', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Assignment'}
            </button>
            <button type="button" onClick={() => router.back()}
              className="text-gray-600 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
