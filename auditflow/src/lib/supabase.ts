import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type UserRole = 'manager' | 'assistant_manager' | 'executive'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  created_at: string
}

export interface Assignment {
  id: string
  title: string
  type: 'internal_audit' | 'concurrent_audit' | 'process_consulting' | 'due_diligence'
  status: 'planning' | 'in_progress' | 'review' | 'completed' | 'on_hold'
  manager_id: string
  client_name: string
  start_date: string
  due_date: string
  description?: string
  created_at: string
  manager?: Profile
}

export interface Task {
  id: string
  assignment_id: string
  title: string
  description?: string
  assigned_to: string
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue'
  priority: 'low' | 'medium' | 'high'
  due_date: string
  created_at: string
  assignment?: Assignment
  assignee?: Profile
}

export interface Observation {
  id: string
  assignment_id: string
  task_id?: string
  title: string
  description: string
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  raised_by: string
  created_at: string
  assignment?: Assignment
  raiser?: Profile
}

export interface TimesheetEntry {
  id: string
  user_id: string
  assignment_id: string
  task_id?: string
  date: string
  hours: number
  description?: string
  created_at: string
  user?: Profile
  assignment?: Assignment
}

export interface AuditLog {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  details: Record<string, unknown>
  created_at: string
  user?: Profile
}
