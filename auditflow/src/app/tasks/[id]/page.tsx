'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/auth'

export default function TaskDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [task, setTask] = useState<Record<string, unknown> | null>(null)
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; completed: boolean }[]>([])
  const [newSubtask, setNewSubtask] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) })
    async function load() {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('tasks').select('*, assignee:profiles(full_name), assignment:assignments(id, title)').eq('id', id).single(),
        supabase.from('subtasks').select('*').eq('task_id', id).order('created_at'),
      ])
      setTask(t)
      setSubtasks(s ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  async function updateStatus(status: string) {
    await supabase.from('tasks').update({ status }).eq('id', id as string)
    setTask(prev => prev ? { ...prev, status } : prev)
    await logAction(userId, 'UPDATE_STATUS', 'task', id as string, { status })
  }

  async function addSubtask() {
    if (!newSubtask.trim()) return
    const { data } = await supabase.from('subtasks').insert({ task_id: id, title: newSubtask }).select().single()
    if (data) setSubtasks(prev => [...prev, data])
    setNewSubtask('')
  }

  async function toggleSubtask(subId: string, completed: boolean) {
    await supabase.from('subtasks').update({ completed }).eq('id', subId)
    setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, completed } : s))
  }

  if (loading) return <AppShell><div className="py-12 text-center text-gray-400">Loading...</div></AppShell>
  if (!task) return <AppShell><div className="py-12 text-center text-gray-400">Task not found</div></AppShell>

  const statusColors: Record<string, string> = {
    not_started: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
  }

  return (
    <AppShell>
      <div className="max-w-3xl">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-900 mb-4 flex items-center gap-1">
          ← Back
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{task.title as string}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {(task.assignment as { title?: string })?.title ?? ''}
              </p>
            </div>
            <select
              value={task.status as string}
              onChange={e => updateStatus(e.target.value)}
              className={`text-sm font-medium px-3 py-1.5 rounded-full border-0 cursor-pointer ${statusColors[task.status as string] ?? 'bg-gray-100'}`}
            >
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Assignee</p>
              <p className="font-medium">{(task.assignee as { full_name?: string })?.full_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-500">Priority</p>
              <p className="font-medium capitalize">{task.priority as string}</p>
            </div>
            <div>
              <p className="text-gray-500">Due Date</p>
              <p className="font-medium">{task.due_date as string}</p>
            </div>
          </div>

          {(task.description as string | undefined) && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-gray-600 text-sm">{task.description as string}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            Subtasks ({subtasks.filter(s => s.completed).length}/{subtasks.length})
          </h3>
          <div className="space-y-2 mb-4">
            {subtasks.map(s => (
              <label key={s.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={s.completed}
                  onChange={e => toggleSubtask(s.id, e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className={`text-sm ${s.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{s.title}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newSubtask}
              onChange={e => setNewSubtask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSubtask()}
              placeholder="Add subtask..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={addSubtask} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">Add</button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
