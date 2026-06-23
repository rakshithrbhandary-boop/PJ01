import AppShell from '@/components/AppShell'

const COMING_SOON = [
  {
    icon: '🤖',
    title: 'AI-Generated Observation Report',
    description: 'Automatically draft audit observation reports using AI — summarizing findings, risk levels, and recommended actions in a structured format.',
    tag: 'AI-Powered',
    tagColor: 'bg-purple-100 text-purple-700',
  },
  {
    icon: '📋',
    title: 'Assignment Status Report',
    description: 'Export a complete status snapshot of any assignment — tasks, observations, team members, progress, and handover history — as PDF or Excel.',
    tag: 'Export',
    tagColor: 'bg-blue-100 text-blue-700',
  },
  {
    icon: '⚠️',
    title: 'Risk Summary Report',
    description: 'Consolidated view of all observations grouped by risk level across assignments, with addressed vs unaddressed breakdown and risk trends.',
    tag: 'Analytics',
    tagColor: 'bg-orange-100 text-orange-700',
  },
  {
    icon: '👤',
    title: 'Executive Performance Report',
    description: 'Task completion rates, overdue tasks, and average turnaround time per executive across all assignments they are involved in.',
    tag: 'Analytics',
    tagColor: 'bg-orange-100 text-orange-700',
  },
  {
    icon: '🔁',
    title: 'Handover & Continuity Report',
    description: 'Full history of assignment handovers with reasons, durations, current handlers, and temporary vs permanent transfer details.',
    tag: 'Export',
    tagColor: 'bg-blue-100 text-blue-700',
  },
  {
    icon: '✅',
    title: 'Observation Response Tracker',
    description: 'Track which observations have been acknowledged, disputed, or are still pending executive response — across all assignments.',
    tag: 'Analytics',
    tagColor: 'bg-orange-100 text-orange-700',
  },
  {
    icon: '⏱️',
    title: 'Time & Effort Report',
    description: 'Hours logged per assignment and team member from timesheets, with effort distribution and billing summaries.',
    tag: 'Export',
    tagColor: 'bg-blue-100 text-blue-700',
  },
  {
    icon: '📜',
    title: 'Audit Trail Export',
    description: 'Exportable log of every create, update, and delete action across the system — with timestamps, users, and before/after values.',
    tag: 'Export',
    tagColor: 'bg-blue-100 text-blue-700',
  },
]

export default function ReportsPage() {
  return (
    <AppShell>
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">Analytics, exports, and AI-powered insights</p>
        </div>

        {/* Under construction banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-10 flex items-start gap-4">
          <span className="text-3xl">🚧</span>
          <div>
            <p className="font-semibold text-amber-900 text-lg">This section is under construction</p>
            <p className="text-amber-700 text-sm mt-1">
              We're building powerful reporting and export tools for AuditFlow. The features below are actively being developed and will be available soon.
            </p>
          </div>
        </div>

        {/* Feature list */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Features Coming Soon</p>
          <div className="grid grid-cols-2 gap-4">
            {COMING_SOON.map(f => (
              <div key={f.title} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex gap-4 opacity-80">
                <span className="text-2xl flex-shrink-0 mt-0.5">{f.icon}</span>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-800 text-sm">{f.title}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.tagColor}`}>{f.tag}</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
