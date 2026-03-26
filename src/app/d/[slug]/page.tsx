import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import DownloadClient from './download-client'
import GpsSection from './gps-section'

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

  // Track (fire-and-forget)
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
  const reward = lead.detected_reward || 'Überraschung'

  // Stamp dots (filled = small colored circles, empty = gray circles)
  const stampDots = Array.from({ length: maxStamps }, (_, i) => i < currentStamps)

  // Short business name: "2A Studio | Toller Stil..." → "2A Studio"
  const shortName = lead.business_name.split(/\s*[|–—\-:]\s*/)[0].trim() || lead.business_name

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'
  const pageUrl = `${baseUrl}/d/${slug}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(pageUrl)}&bgcolor=ffffff&color=000000`

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">

      {/* Animated Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[120px] animate-float"
          style={{ backgroundColor: labelColor, opacity: 0.07 }} />
        <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] rounded-full blur-[100px] animate-float-delayed"
          style={{ backgroundColor: bgColor, opacity: 0.05 }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[150px] animate-float-slow"
          style={{ backgroundColor: labelColor, opacity: 0.03 }} />
      </div>

      <div className="relative z-10 flex flex-col items-center px-5 py-10">

        {/* ═══ HEADER: Logo + Name — always centered on top ═══ */}
        <div className="animate-fade-in flex flex-col items-center mb-8 mt-6">
          {hasRealLogo && (
            <div className="w-16 h-16 rounded-2xl shadow-lg overflow-hidden mb-3 bg-white/5 border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lead.logo_url!} alt="" className="w-full h-full object-contain p-1.5" />
            </div>
          )}
          <h1 className="text-xl font-bold text-center">{shortName}</h1>
        </div>

        {/* ═══ HEADLINE — centered ═══ */}
        <div className="animate-fade-in text-center mb-8 max-w-lg" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Stempelkarte ohne App.
          </h2>
          <p className="text-white/50 text-sm md:text-base">
            Direkt in der <span className="text-white/80 font-semibold">Apple Wallet</span> — deine Kunden haben sie immer dabei. Kein Download, kein Aufwand.
          </p>
        </div>

        {/* ═══ MAIN: Mockup + QR/Buttons side by side on desktop ═══ */}
        <div className={`w-full max-w-4xl ${isDesktop ? 'flex items-center gap-12 justify-center' : 'flex flex-col items-center'}`}>

          {/* WALLET PASS MOCKUP */}
          <div className="animate-slide-up shrink-0 mb-8 lg:mb-0">
            <div className="w-[300px] rounded-[20px] overflow-hidden shadow-2xl border border-white/10"
              style={{ backgroundColor: bgColor }}>

              {/* Header: Logo + Name (right side optional) */}
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {hasRealLogo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lead.logo_url!} alt="" className="w-10 h-10 rounded-lg object-contain" />
                  )}
                  <span className="font-semibold text-sm truncate max-w-[180px]" style={{ color: textColor }}>{shortName}</span>
                </div>
              </div>

              {/* Strip Image + Stamp Count Overlay */}
              <div className="relative h-[130px]">
                {lead.strip_image_url ? (
                  <div className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${lead.strip_image_url})` }} />
                ) : (
                  <div className="absolute inset-0" style={{ backgroundColor: bgColor }} />
                )}
                {/* Gradient overlay for text readability */}
                <div className="absolute inset-0" style={{
                  background: `linear-gradient(90deg, ${bgColor} 0%, ${bgColor} 20%, transparent 70%)`
                }} />
                {/* Stamp count */}
                <div className="absolute bottom-4 left-5">
                  <p className="text-4xl font-bold tracking-tight" style={{ color: textColor }}>
                    {currentStamps} von {maxStamps}
                  </p>
                  <p className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: labelColor }}>
                    Deine Stempel
                  </p>
                </div>
              </div>

              {/* Fields Row: Prämie + Fortschritt */}
              <div className="px-5 py-3 flex items-start justify-between border-t border-white/5">
                <div>
                  <p className="text-[9px] uppercase tracking-wider" style={{ color: labelColor }}>Prämie</p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: textColor }}>{reward} 🎁</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-wider" style={{ color: labelColor }}>Fortschritt</p>
                  <div className="flex items-center gap-1 mt-1">
                    {stampDots.map((filled, i) => (
                      <div key={i} className={`w-2.5 h-2.5 rounded-full ${filled ? '' : 'opacity-30'}`}
                        style={{ backgroundColor: filled ? labelColor : '#888' }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* QR Section */}
              <div className="flex justify-center py-6" style={{ backgroundColor: bgColor }}>
                <div className="bg-white rounded-xl p-3">
                  <div className="w-[120px] h-[120px] bg-gray-200 rounded flex items-center justify-center">
                    <svg viewBox="0 0 100 100" className="w-full h-full opacity-20">
                      <rect x="10" y="10" width="25" height="25" fill="black"/>
                      <rect x="65" y="10" width="25" height="25" fill="black"/>
                      <rect x="10" y="65" width="25" height="25" fill="black"/>
                      <rect x="40" y="40" width="20" height="20" fill="black"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Pagination Dots (decorative) */}
              <div className="flex justify-center gap-1.5 pb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
              </div>
            </div>
          </div>

          {/* ═══ RIGHT SIDE: QR + Buttons ═══ */}
          <div className="flex flex-col items-center max-w-sm">

            {/* QR (Desktop) */}
            {isDesktop && (
              <div className="animate-fade-in mb-6" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
                <p className="text-white/30 text-xs text-center mb-2">Mit dem Handy scannen:</p>
                <div className="relative inline-block">
                  <div className="absolute -inset-2 rounded-xl blur-lg opacity-10"
                    style={{ backgroundColor: labelColor }} />
                  <div className="relative bg-white rounded-xl p-2.5 shadow-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrUrl} alt="QR Code" className="w-32 h-32" />
                  </div>
                </div>
              </div>
            )}

            {/* Wallet Buttons */}
            <div className="animate-fade-in w-full" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
              <DownloadClient
                leadId={lead.id}
                passSerial={lead.pass_serial}
                googlePassUrl={lead.google_pass_url}
                isIOS={isIOS}
                isAndroid={isAndroid}
              />

              {/* WhatsApp CTA — box with shimmer button */}
              <div className="mt-5 border border-white/10 rounded-2xl p-5 bg-white/[0.02] backdrop-blur-sm text-center">
                <p className="text-white/60 text-sm mb-3">
                  Interesse? Lass uns kurz sprechen — <span className="text-white/80 font-medium">unverbindlich</span>.
                </p>
                <a href={`https://wa.me/49151533344?text=${encodeURIComponent(`Hallo, ich habe die digitale Treuekarte für ${lead.business_name} gesehen und hätte Interesse!`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="relative inline-flex items-center justify-center gap-2.5 px-8 py-3.5
                    rounded-full font-semibold bg-[#25D366] text-white
                    hover:bg-[#20BD5A] hover:scale-[1.02] active:scale-[0.98]
                    transition-all duration-200 shadow-lg shadow-green-500/20 overflow-hidden">
                  <div className="absolute inset-0 animate-shimmer"
                    style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.2) 50%, transparent 60%)', backgroundSize: '200% 100%' }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/whatsapp.svg" alt="" className="w-5 h-5 relative" />
                  <span className="relative">Per WhatsApp kontaktieren</span>
                </a>
              </div>
            </div>

          </div>
        </div>

        {/* ═══ BENEFITS — centered grid, below main content ═══ */}
        <div className="mt-12 max-w-md mx-auto w-full">
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '📲', title: 'Push aufs Handy', text: 'Direkt auf dem Sperrbildschirm' },
              { icon: '📍', title: 'GPS-Reminder', text: 'Kunden in der Nähe anlocken' },
              { icon: '⚡', title: 'Ohne App-Download', text: 'Nahtlos in Apple & Google Wallet' },
              { icon: '🔄', title: 'Mehr Stammkunden', text: 'Digital statt Papierstempel' },
            ].map((b, i) => (
              <div key={i} className="animate-benefit text-center p-4 rounded-xl border border-white/5 bg-white/[0.02]"
                style={{ animationDelay: `${0.6 + i * 0.1}s`, animationFillMode: 'both' }}>
                <span className="text-2xl">{b.icon}</span>
                <p className="text-white/70 text-xs font-semibold mt-2">{b.title}</p>
                <p className="text-white/30 text-[10px] mt-0.5">{b.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* GPS Geofencing Section */}
        <GpsSection
          businessName={lead.business_name}
          logoUrl={hasRealLogo ? lead.logo_url : null}
          labelColor={labelColor}
        />

      </div>

      {/* Sticky WhatsApp Button — round, bottom right */}
      <a href={`https://wa.me/49151533344?text=${encodeURIComponent(`Hallo, ich habe die digitale Treuekarte für ${lead.business_name} gesehen und hätte Interesse!`)}`}
        target="_blank" rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 flex items-center justify-center
          rounded-full bg-[#25D366]
          shadow-[0_4px_20px_rgba(37,211,102,0.5)]
          hover:scale-[1.1] active:scale-[0.9] transition-all duration-200">
        {/* Red notification dot — ping + solid */}
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-[#0a0a0a]" />
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/whatsapp.svg" alt="WhatsApp" className="w-7 h-7" />
      </a>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); }
          33% { transform: translateY(-30px) translateX(15px); }
          66% { transform: translateY(15px) translateX(-20px); }
        }
        .animate-float { animation: float 8s ease-in-out infinite; }
        .animate-float-delayed { animation: float 10s ease-in-out infinite 2s; }
        .animate-float-slow { animation: float 14s ease-in-out infinite 4s; }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-slide-up { animation: slideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeIn 0.5s ease-out both; }

        @keyframes benefitIn {
          from { opacity: 0; transform: translateX(-15px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-benefit { animation: benefitIn 0.4s ease-out both; }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-shimmer { animation: shimmer 3s ease-in-out infinite; }

        @keyframes pingDot {
          0% { transform: scale(1); opacity: 1; }
          75% { transform: scale(2); opacity: 0; }
          100% { transform: scale(2); opacity: 0; }
        }
        .animate-ping-dot { animation: pingDot 1.5s ease-out infinite; }
      `}</style>
    </div>
  )
}
