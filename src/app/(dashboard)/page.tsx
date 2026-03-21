export default function DashboardPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Dashboard</h2>
      <p className="text-zinc-400 mb-8">Conversion Funnel & Activity</p>

      {/* Funnel Placeholder */}
      <div className="grid grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Gesendet', value: '—', color: 'bg-zinc-800' },
          { label: 'Geöffnet', value: '—', color: 'bg-zinc-800' },
          { label: 'Geklickt', value: '—', color: 'bg-zinc-800' },
          { label: 'Installiert', value: '—', color: 'bg-zinc-800' },
          { label: 'Geantwortet', value: '—', color: 'bg-zinc-800' },
          { label: 'Converted', value: '—', color: 'bg-zinc-800' },
        ].map((step) => (
          <div key={step.label} className={`${step.color} rounded-xl p-4 text-center`}>
            <div className="text-2xl font-bold">{step.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{step.label}</div>
          </div>
        ))}
      </div>

      {/* Active Campaigns Placeholder */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Active Campaigns</h3>
        <p className="text-zinc-500 text-sm">Noch keine Kampagnen. Erstelle eine unter Campaigns.</p>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        <p className="text-zinc-500 text-sm">Noch keine Aktivität.</p>
      </div>
    </div>
  )
}
