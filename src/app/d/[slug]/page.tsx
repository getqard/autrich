import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import DownloadClient from './download-client'

export const dynamic = 'force-dynamic'

export default async function DownloadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('download_page_slug', slug)
    .single()

  if (!lead) notFound()

  // Pass not ready yet
  if (lead.pass_status !== 'ready') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Deine Treuekarte wird vorbereitet...</p>
        </div>
      </div>
    )
  }

  // Device detection
  const headersList = await headers()
  const ua = headersList.get('user-agent') || ''
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isAndroid = /Android/i.test(ua)
  const isDesktop = !isIOS && !isAndroid

  // Track visit (fire-and-forget)
  supabase.from('tracking_events').insert({
    lead_id: lead.id,
    event_type: isDesktop ? 'page_visited_desktop' : 'page_visited_mobile',
    metadata: { slug, platform: isIOS ? 'ios' : isAndroid ? 'android' : 'desktop' },
  }).then(() => {})

  if (!lead.email_clicked_at) {
    supabase.from('leads').update({
      email_clicked_at: new Date().toISOString(),
      pipeline_status: lead.pipeline_status === 'contacted' ? 'engaged' : lead.pipeline_status,
    }).eq('id', lead.id).then(() => {})
  }

  // Data
  const bgColor = lead.dominant_color || '#1a1a2e'
  const textColor = lead.text_color || '#ffffff'
  const labelColor = lead.label_color || '#999999'
  const hasRealLogo = lead.logo_url && lead.logo_source !== 'generated' && lead.logo_source !== 'favicon'
  const stampEmoji = lead.detected_stamp_emoji || '⭐'
  const currentStamps = 3
  const maxStamps = lead.detected_max_stamps || 10
  const stampVisual = ((stampEmoji + ' ').repeat(currentStamps) + ('⚪ ').repeat(maxStamps - currentStamps)).trim()
  const reward = lead.detected_reward || 'Überraschung'

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'
  const pageUrl = `${baseUrl}/d/${slug}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(pageUrl)}&bgcolor=ffffff&color=000000`

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">

      {/* Animated Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[120px] animate-float"
          style={{ backgroundColor: labelColor, opacity: 0.08 }} />
        <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] rounded-full blur-[100px] animate-float-delayed"
          style={{ backgroundColor: bgColor, opacity: 0.06 }} />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12">

        {/* Logo + Name */}
        <div className="animate-fade-in flex flex-col items-center mb-8">
          {hasRealLogo && (
            <div className="w-16 h-16 rounded-xl shadow-lg overflow-hidden mb-3 bg-white/5 backdrop-blur-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lead.logo_url!} alt="" className="w-full h-full object-contain" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-center">{lead.business_name}</h1>
        </div>

        {/* Layout: side-by-side on desktop, stacked on mobile */}
        <div className={`w-full max-w-3xl ${isDesktop ? 'flex items-start gap-12 justify-center' : 'flex flex-col items-center'}`}>

          {/* Pass Preview Card */}
          <div className="animate-slide-up mb-8 shrink-0">
            <div className="rounded-2xl overflow-hidden shadow-2xl w-72 border border-white/10"
              style={{ backgroundColor: bgColor }}>
              {lead.strip_image_url && (
                <div className="h-24 bg-cover bg-center opacity-80"
                  style={{ backgroundImage: `url(${lead.strip_image_url})` }} />
              )}
              <div className="p-4 flex items-center gap-3">
                {hasRealLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lead.logo_url!} alt="" className="w-8 h-8 rounded-md" />
                )}
                <span className="font-semibold text-sm" style={{ color: textColor }}>{lead.business_name}</span>
              </div>
              <div className="px-4 pb-4">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: labelColor }}>Deine Stempel</p>
                <p className="text-2xl font-bold mt-0.5" style={{ color: textColor }}>{currentStamps} von {maxStamps}</p>
                <p className="mt-3 text-sm tracking-wider">{stampVisual}</p>
                <p className="text-[10px] uppercase tracking-wider mt-3" style={{ color: labelColor }}>Prämie</p>
                <p className="text-sm mt-0.5" style={{ color: textColor }}>{reward} 🎁</p>
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="flex flex-col items-center">
            <div className="animate-fade-in text-center mb-6" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
              <h2 className="text-xl font-semibold mb-1">Deine digitale Stempelkarte</h2>
              <p className="text-white/50 text-sm">ist fertig!</p>
            </div>

            {/* QR (Desktop) */}
            {isDesktop && (
              <div className="animate-fade-in mb-6" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
                <p className="text-white/40 text-xs text-center mb-3">Scanne mit deinem Smartphone:</p>
                <div className="relative">
                  <div className="absolute inset-0 rounded-3xl blur-xl opacity-15"
                    style={{ backgroundColor: labelColor }} />
                  <div className="relative bg-white rounded-3xl p-5 shadow-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrUrl} alt="QR Code" className="w-48 h-48" />
                  </div>
                </div>
                <p className="text-white/20 text-[10px] text-center mt-2 font-mono">{slug}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="animate-fade-in w-full" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
              <DownloadClient
                leadId={lead.id}
                passSerial={lead.pass_serial}
                googlePassUrl={lead.google_pass_url}
                phone={lead.phone}
                isIOS={isIOS}
                isAndroid={isAndroid}
              />
            </div>

            {/* Benefits */}
            <div className="mt-8 space-y-3 max-w-xs">
              {[
                'Kunden per Push direkt auf dem Sperrbildschirm erreichen',
                'Mehr Laufkundschaft durch GPS-Erinnerungen in der Nähe',
                `Deine Prämie: ${reward} 🎁`,
                'Kostenlos. Keine App nötig.',
              ].map((benefit, i) => (
                <div key={i} className="animate-benefit flex items-start gap-2.5 text-sm text-white/60"
                  style={{ animationDelay: `${0.5 + i * 0.12}s`, animationFillMode: 'both' }}>
                  <span className="text-green-400 mt-0.5 text-xs">✓</span>
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); }
          33% { transform: translateY(-20px) translateX(10px); }
          66% { transform: translateY(10px) translateX(-15px); }
        }
        .animate-float { animation: float 8s ease-in-out infinite; }
        .animate-float-delayed { animation: float 10s ease-in-out infinite 2s; }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slideUp 0.6s ease-out both; }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in { animation: fadeIn 0.5s ease-out both; }
        @keyframes benefitIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-benefit { animation: benefitIn 0.4s ease-out both; }
      `}</style>
    </div>
  )
}
