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

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-5 py-10">

        {/* Logo + Name */}
        <div className="animate-fade-in flex flex-col items-center mb-6">
          {hasRealLogo && (
            <div className="w-14 h-14 rounded-2xl shadow-lg overflow-hidden mb-3 bg-white/5 backdrop-blur-sm border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lead.logo_url!} alt="" className="w-full h-full object-contain p-1" />
            </div>
          )}
          <h1 className="text-xl font-bold text-center">{lead.business_name}</h1>
        </div>

        {/* Layout */}
        <div className={`w-full max-w-4xl ${isDesktop ? 'flex items-center gap-16 justify-center' : 'flex flex-col items-center'}`}>

          {/* ═══ WALLET PASS MOCKUP ═══ */}
          <div className="animate-slide-up mb-8 shrink-0">
            <div className="w-[320px] rounded-[20px] overflow-hidden shadow-2xl border border-white/10"
              style={{ backgroundColor: bgColor }}>

              {/* Header: Logo + Name (right side optional) */}
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {hasRealLogo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lead.logo_url!} alt="" className="w-10 h-10 rounded-lg object-contain" />
                  )}
                  <span className="font-semibold text-sm" style={{ color: textColor }}>{lead.business_name}</span>
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

          {/* ═══ RIGHT SIDE ═══ */}
          <div className="flex flex-col items-center max-w-sm">

            <div className="animate-fade-in text-center mb-8" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
              <h2 className="text-2xl font-bold mb-2">
                Die digitale Treuekarte<br />
                <span className="text-white/60">für {lead.business_name}</span>
              </h2>
              <p className="text-white/35 text-sm mt-2">
                Direkt in der <span className="text-white/70 font-semibold">Apple Wallet</span> deiner Kunden.
              </p>
              <p className="text-white/20 text-xs mt-1">Keine App nötig. Kostenlos.</p>
            </div>

            {/* QR (Desktop) */}
            {isDesktop && (
              <div className="animate-fade-in mb-8" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
                <p className="text-white/30 text-xs text-center mb-3">Mit dem Handy scannen:</p>
                <div className="relative inline-block">
                  <div className="absolute -inset-3 rounded-2xl blur-xl opacity-10"
                    style={{ backgroundColor: labelColor }} />
                  <div className="relative bg-white rounded-2xl p-3 shadow-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrUrl} alt="QR Code" className="w-40 h-40" />
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
            </div>

            {/* Benefits — written for the business owner */}
            <div className="mt-10 space-y-4 w-full">
              {[
                { icon: '📲', text: 'Erreiche deine Kunden per Push-Nachricht — direkt auf dem Sperrbildschirm' },
                { icon: '📍', text: 'Kunden in der Nähe werden automatisch an deinen Laden erinnert' },
                { icon: '🔄', text: 'Kunden kommen öfter wieder — durch digitale Stempel statt Papierkarten' },
                { icon: '🎁', text: `Deine Kunden sammeln Stempel für: ${reward}` },
              ].map((b, i) => (
                <div key={i} className="animate-benefit flex items-start gap-3 text-sm"
                  style={{ animationDelay: `${0.6 + i * 0.1}s`, animationFillMode: 'both' }}>
                  <span className="text-lg shrink-0 mt-0.5">{b.icon}</span>
                  <span className="text-white/45">{b.text}</span>
                </div>
              ))}
            {/* WhatsApp CTA — conversion focused */}
            {lead.phone && (
              <div className="animate-fade-in mt-10 w-full" style={{ animationDelay: '1s', animationFillMode: 'both' }}>
                <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.02] backdrop-blur-sm text-center">
                  <p className="text-white/60 text-sm mb-3">
                    Interesse? Lass uns kurz sprechen — <span className="text-white/80 font-medium">unverbindlich</span>.
                  </p>
                  <a href={`https://wa.me/${lead.phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(`Hallo, ich habe die digitale Treuekarte für ${lead.business_name} gesehen und hätte Interesse!`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5
                      rounded-full font-semibold bg-[#25D366] text-white
                      hover:bg-[#20BD5A] hover:scale-[1.02] active:scale-[0.98]
                      transition-all duration-200 shadow-lg shadow-green-500/20">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .612.616l4.575-1.453A11.93 11.93 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.94 9.94 0 0 1-5.39-1.584l-.386-.232-2.716.862.886-2.635-.253-.403A9.935 9.935 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                    </svg>
                    Per WhatsApp kontaktieren
                  </a>
                </div>
              </div>
            )}

            </div>
          </div>
        </div>
      </div>

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
      `}</style>
    </div>
  )
}
