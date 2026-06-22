-- AuditFlow Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  role text not null check (role in ('manager', 'assistant_manager', 'executive')),
  created_at timestamptz default now()
);

-- Assignments table
create table assignments (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  type text not null check (type in ('internal_audit', 'concurrent_audit', 'process_consulting', 'due_diligence')),
  status text not null default 'planning' check (status in ('planning', 'in_progress', 'review', 'completed', 'on_hold')),
  manager_id uuid references profiles(id) not null,
  client_name text not null,
  start_date date not null,
  due_date date not null,
  description text,
  created_at timestamptz default now()
);

-- Tasks table
create table tasks (
  id uuid default uuid_generate_v4() primary key,
  assignment_id uuid references assignments(id) on delete cascade not null,
  title text not null,
  description text,
  assigned_to uuid references profiles(id) not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'overdue')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date not null,
  created_at timestamptz default now()
);

-- Subtasks table
create table subtasks (
  id uuid default uuid_generate_v4() primary key,
  task_id uuid references tasks(id) on delete cascade not null,
  title text not null,
  completed boolean default false,
  created_at timestamptz default now()
);

-- Observations table
create table observations (
  id uuid default uuid_generate_v4() primary key,
  assignment_id uuid references assignments(id) on delete cascade not null,
  task_id uuid references tasks(id) on delete set null,
  title text not null,
  description text not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  raised_by uuid references profiles(id) not null,
  created_at timestamptz default now()
);

-- Timesheet entries
create table timesheet_entries (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) not null,
  assignment_id uuid references assignments(id) on delete cascade not null,
  task_id uuid references tasks(id) on delete set null,
  date date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  description text,
  created_at timestamptz default now()
);

-- Audit logs
create table audit_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb default '{}',
  created_at timestamptz default now()
);

-- Notifications
create table notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  message text not null,
  type text default 'info' check (type in ('info', 'warning', 'error', 'success')),
  read boolean default false,
  created_at timestamptz default now()
);

-- Row Level Security Policies
alter table profiles enable row level security;
alter table assignments enable row level security;
alter table tasks enable row level security;
alter table subtasks enable row level security;
alter table observations enable row level security;
alter table timesheet_entries enable row level security;
alter table audit_logs enable row level security;
alter table notifications enable row level security;

-- Profiles: users can read all, update own
create policy "Profiles are viewable by authenticated users" on profiles for select using (auth.role() = 'authenticated');
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- Assignments: all authenticated users can read; managers can create/update
create policy "Assignments viewable by authenticated users" on assignments for select using (auth.role() = 'authenticated');
create policy "Managers can create assignments" on assignments for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('manager', 'assistant_manager'))
);
create policy "Managers can update assignments" on assignments for update using (
  exists (select 1 from profiles where id = auth.uid() and role in ('manager', 'assistant_manager'))
);
create policy "Managers can delete assignments" on assignments for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'manager')
);

-- Tasks: all can read, managers/assistants can create/update
create policy "Tasks viewable by authenticated users" on tasks for select using (auth.role() = 'authenticated');
create policy "Staff can create tasks" on tasks for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('manager', 'assistant_manager'))
);
create policy "Staff can update tasks" on tasks for update using (auth.role() = 'authenticated');
create policy "Managers can delete tasks" on tasks for delete using (
  exists (select 1 from profiles where id = auth.uid() and role in ('manager', 'assistant_manager'))
);

-- Subtasks
create policy "Subtasks viewable by all" on subtasks for select using (auth.role() = 'authenticated');
create policy "Anyone can manage subtasks" on subtasks for all using (auth.role() = 'authenticated');

-- Observations: all can read, any auth user can create
create policy "Observations viewable by all" on observations for select using (auth.role() = 'authenticated');
create policy "Anyone can create observations" on observations for insert with check (auth.role() = 'authenticated');
create policy "Anyone can update observations" on observations for update using (auth.role() = 'authenticated');

-- Timesheet: users can manage own entries
create policy "Users can view all timesheets" on timesheet_entries for select using (auth.role() = 'authenticated');
create policy "Users can create own timesheet" on timesheet_entries for insert with check (auth.uid() = user_id);
create policy "Users can update own timesheet" on timesheet_entries for update using (auth.uid() = user_id);
create policy "Users can delete own timesheet" on timesheet_entries for delete using (auth.uid() = user_id);

-- Audit logs: all can read, system inserts
create policy "Audit logs viewable by all" on audit_logs for select using (auth.role() = 'authenticated');
create policy "Anyone can insert audit logs" on audit_logs for insert with check (auth.role() = 'authenticated');

-- Notifications: users see own
create policy "Users see own notifications" on notifications for select using (auth.uid() = user_id);
create policy "System can create notifications" on notifications for insert with check (auth.role() = 'authenticated');
create policy "Users can update own notifications" on notifications for update using (auth.uid() = user_id);

-- Function: auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'assistant_manager')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Sample seed data (optional - creates demo users concept)
-- You'll create real users through the app's registration or Supabase Auth dashboard
