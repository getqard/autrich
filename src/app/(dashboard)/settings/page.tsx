export default function SettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Settings</h2>
      <p className="text-zinc-400 mb-8">Configuration & API Keys</p>

      <div className="space-y-6">
        {/* Connection Status */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Service Status</h3>
          <div className="space-y-3">
            {[
              { name: 'Supabase', status: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'connected' : 'not configured' },
              { name: 'Instantly.ai', status: 'not configured' },
              { name: 'Claude AI (Anthropic)', status: 'not configured' },
              { name: 'Apple Wallet', status: 'Phase 5' },
              { name: 'Google Wallet', status: 'Phase 5' },
              { name: 'Twilio SMS', status: 'Phase 6' },
              { name: 'Trigger.dev', status: 'not configured' },
            ].map((service) => (
              <div key={service.name} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                <span className="text-sm">{service.name}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  service.status === 'connected'
                    ? 'bg-green-500/10 text-green-400'
                    : service.status.startsWith('Phase')
                    ? 'bg-zinc-800 text-zinc-500'
                    : 'bg-yellow-500/10 text-yellow-400'
                }`}>
                  {service.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Calendly URL */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Calendly</h3>
          <p className="text-zinc-500 text-sm mb-3">URL für Demo-Call Buchungen bei interessierten Leads</p>
          <input
            type="url"
            placeholder="https://calendly.com/your-link"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
        </div>
      </div>
    </div>
  )
}
