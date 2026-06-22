'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const DEFAULT_TYPES = [
  { value: 'internal_audit', label: 'Internal Audit' },
  { value: 'concurrent_audit', label: 'Concurrent Audit' },
  { value: 'process_consulting', label: 'Process Consulting' },
  { value: 'due_diligence', label: 'Due Diligence' },
]

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function AssignmentTypeSelect({ value, onChange }: Props) {
  const [customTypes, setCustomTypes] = useState<{ value: string; label: string }[]>([])
  const [showInput, setShowInput] = useState(false)
  const [newType, setNewType] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('assignment_types').select('value, label').order('created_at')
      .then(({ data }) => setCustomTypes(data ?? []))
  }, [])

  useEffect(() => {
    if (showInput) inputRef.current?.focus()
  }, [showInput])

  const allTypes = [...DEFAULT_TYPES, ...customTypes]

  async function addType() {
    const label = newType.trim()
    if (!label) return
    const typeValue = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (allTypes.find(t => t.value === typeValue)) {
      onChange(typeValue)
      setShowInput(false)
      setNewType('')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('assignment_types').insert({ value: typeValue, label })
    if (!error) {
      const entry = { value: typeValue, label }
      setCustomTypes(prev => [...prev, entry])
      onChange(typeValue)
    }
    setSaving(false)
    setShowInput(false)
    setNewType('')
  }

  return (
    <div>
      {!showInput ? (
        <div className="flex gap-2">
          <select
            value={value}
            onChange={e => {
              if (e.target.value === '__add_new__') { setShowInput(true) }
              else onChange(e.target.value)
            }}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {allTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            <option value="__add_new__">➕ Add new type...</option>
          </select>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={newType}
            onChange={e => setNewType(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addType() } if (e.key === 'Escape') { setShowInput(false); setNewType('') } }}
            placeholder="Type new assignment type..."
            className="flex-1 px-4 py-2.5 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            type="button"
            onClick={addType}
            disabled={saving || !newType.trim()}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '...' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => { setShowInput(false); setNewType('') }}
            className="px-3 py-2.5 text-gray-500 hover:text-gray-700 text-sm"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
