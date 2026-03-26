'use client'

import { useState, useEffect, useRef } from 'react'

type Props = {
  businessName: string
  logoUrl: string | null
  labelColor: string
}

export default function GpsSection({ businessName, logoUrl, labelColor }: Props) {
  const [showPush, setShowPush] = useState(false)
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Intersection Observer — trigger when scrolled into view
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        observer.disconnect()
      }
    }, { threshold: 0.3 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Animation timing — dot arrives → push notification appears
  useEffect(() => {
    if (!inView) return
    let interval: ReturnType<typeof setInterval>

    const timer = setTimeout(() => {
      setShowPush(true)
      interval = setInterval(() => {
        setShowPush(false)
        setTimeout(() => setShowPush(true), 800)
      }, 5000)
    }, 1500)

    return () => { clearTimeout(timer); clearInterval(interval) }
  }, [inView])

  return (
    <div ref={ref} className="w-full max-w-3xl mx-auto mt-16 px-4">

      {/* Heading */}
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold">
          Magische Anziehung.{' '}
          <span style={{ color: labelColor }}>Per GPS.</span>
        </h3>
        <p className="text-white/40 text-sm mt-2 max-w-md mx-auto">
          Dein Kunde läuft an {businessName} vorbei? Er bekommt automatisch eine Nachricht. Perfektes Timing, null Aufwand.
        </p>
      </div>

      {/* Map + Animation */}
      <div className="relative h-[340px] lg:h-[420px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">

        {/* Background Map */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/geofence-map.webp" alt="" loading="lazy"
          className="absolute inset-0 w-full h-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-black/30" />

        {/* Geofence Circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-[240px] h-[240px] lg:w-[280px] lg:h-[280px] rounded-full border-2 border-blue-500/40 bg-blue-500/15 flex items-center justify-center relative backdrop-blur-[1px]">
            {/* Center Pin */}
            <div className="w-4 h-4 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.9)] border border-white/50 z-10"
              style={{ backgroundColor: labelColor }} />
            {/* Radar Ping */}
            <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-radar" />
          </div>
        </div>

        {/* Moving Blue Dot (user approaching) */}
        <div className={`absolute w-5 h-5 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)] border-2 border-white z-10
          transition-all duration-[1500ms] ease-in-out
          ${inView ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-100' : 'top-[15%] left-[15%] scale-0'}`}>
          {showPush && (
            <div className="absolute inset-0 rounded-full bg-blue-400/60 animate-dot-pulse" />
          )}
        </div>

        {/* Push Notification */}
        <div className={`absolute top-4 inset-x-3 max-w-[320px] mx-auto z-50 pointer-events-none
          transition-all duration-500 ease-out
          ${showPush ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-8 scale-95'}`}>
          <div className="bg-black/40 backdrop-blur-2xl border border-white/15 rounded-[20px] p-2.5 shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
            <div className="flex items-start gap-2.5">
              {/* App Icon */}
              <div className="w-[32px] h-[32px] rounded-[8px] shrink-0 overflow-hidden mt-0.5 shadow-inner"
                style={{ backgroundColor: labelColor }}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="w-full h-full object-contain p-[2px] rounded-[7px]" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                    {businessName.charAt(0)}
                  </div>
                )}
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0 pt-[1px]">
                <div className="flex items-baseline justify-between mb-[2px] gap-2">
                  <h4 className="text-white/90 font-semibold text-[12px] leading-none truncate">{businessName}</h4>
                  <span className="text-white/35 text-[10px] shrink-0">Gerade eben</span>
                </div>
                <p className="text-white/75 text-[11.5px] leading-[1.3] mt-[2px]">
                  Du bist in der Nähe! Schau vorbei und sammle deinen nächsten Stempel. 🎯
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Box */}
      <div className="mt-6 bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <div className="flex gap-3">
          <span className="text-2xl shrink-0">📍</span>
          <div>
            <h4 className="font-semibold text-white/80 text-sm mb-1">Automatisch im richtigen Moment.</h4>
            <p className="text-xs text-white/40 leading-relaxed">
              Laufkundschaft wird zu Stammkundschaft. Sobald ein Kunde in der Nähe deines Ladens ist, bekommt er eine Erinnerung auf dem Sperrbildschirm — ohne dass du etwas tun musst.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes radar {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0.3; }
        }
        .animate-radar { animation: radar 3s ease-in-out infinite; }

        @keyframes dotPulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .animate-dot-pulse { animation: dotPulse 2s ease-out infinite; }
      `}</style>
    </div>
  )
}
