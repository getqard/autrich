/**
 * Apple-Wallet-Mockup als Satori-JSX.
 * Wird von /api/leads/[id]/mockup über next/og als PNG gerendert.
 *
 * Layout (600 × 1200):
 *   - iPhone-Frame (schwarz, gerundet, Dynamic-Island oben)
 *   - Status-Bar (Zeit + Signal/WiFi/Battery als Emoji/SVG-Äquivalent)
 *   - Wallet-Hintergrund (helles Grau, sanfter Verlauf)
 *   - Pass-Card mit: Logo, KUNDE-ID, Strip-Image (optional), Stempel-Counter,
 *     PRÄMIE/FORTSCHRITT-Row, QR-Code
 *
 * POWERED-BY wurde per Lano-Entscheidung entfernt.
 */

import type { ReactElement } from 'react'

export type MockupInput = {
  business_name: string
  logo_url: string | null
  logo_base64?: string | null // Pre-fetched for Edge-Runtime-Safety
  strip_image_url?: string | null
  strip_image_base64?: string | null
  dominant_color: string
  text_color: string
  label_color: string
  detected_reward: string | null
  detected_reward_emoji: string | null
  detected_stamp_emoji: string | null
  detected_max_stamps: number
  detected_pass_title: string
  qr_data_url: string // Already generated PNG data URL
  filled_stamps?: number // Default: 2
  /** Wenn gesetzt UND kein Logo vorhanden: zeigt Branchen-Emoji statt Text-Logo */
  industry_emoji?: string | null
}

/**
 * Baut das Satori-JSX für den Mockup.
 * Alle Bilder müssen bereits als Data-URL vorliegen (Edge-Runtime lädt nicht extern).
 */
export function buildMockupJsx(i: MockupInput): ReactElement {
  const filled = i.filled_stamps ?? 2
  const maxStamps = Math.min(Math.max(i.detected_max_stamps || 10, 5), 12)
  const stampEmoji = i.detected_stamp_emoji || '★'
  const rewardEmoji = i.detected_reward_emoji || '🎁'
  const reward = i.detected_reward || 'Gratis Belohnung'
  const passTitle = i.detected_pass_title || 'Treuekarte'
  const logoSrc = i.logo_base64 || i.logo_url || null
  const stripSrc = i.strip_image_base64 || i.strip_image_url || null
  const kundeId = '0H' + (i.business_name.length * 7919 % 99999).toString(36).toUpperCase().padStart(4, '0')

  const bg = i.dominant_color || '#0a0a0a'
  const text = i.text_color || '#ffffff'
  const label = i.label_color || '#9ca3af'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '600px',
        height: '1200px',
        background: 'linear-gradient(180deg, #e5e7eb 0%, #d4d4d8 100%)',
        position: 'relative',
      }}
    >
      {/* iPhone-Frame (schwarzer Rand rundum mit abgerundeten Ecken) */}
      <div
        style={{
          position: 'absolute',
          top: '40px',
          left: '40px',
          right: '40px',
          bottom: '40px',
          width: '520px',
          height: '1120px',
          background: '#000000',
          borderRadius: '72px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        }}
      >
        {/* Screen (innere Fläche) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '492px',
            height: '1092px',
            background: '#f3f4f6',
            borderRadius: '58px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Dynamic-Island (schwarzer Blob oben mittig) */}
          <div
            style={{
              position: 'absolute',
              top: '18px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '120px',
              height: '36px',
              background: '#000000',
              borderRadius: '18px',
              zIndex: 10,
            }}
          />

          {/* Status-Bar (Zeit links, Signal/WiFi/Battery rechts) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '22px 36px 0 36px',
              fontSize: '17px',
              fontWeight: 600,
              color: '#000',
              height: '56px',
            }}
          >
            <span>10:52</span>
            <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
              {/* Signal-Bars (4 steigend) */}
              <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
                {[4, 6, 9, 12].map(h => (
                  <div
                    key={h}
                    style={{ width: '3.5px', height: `${h}px`, background: '#000', borderRadius: '1px' }}
                  />
                ))}
              </div>
              {/* WiFi — SVG-Fan (echtes Apple-Style) */}
              <svg width="16" height="12" viewBox="0 0 16 12" style={{ display: 'flex' }}>
                <path d="M8 1.5 C 4.5 1.5, 1.8 2.9, 0.3 4.4 L 2 6.1 C 3.1 5.0, 5.3 4.0, 8 4.0 C 10.7 4.0, 12.9 5.0, 14 6.1 L 15.7 4.4 C 14.2 2.9, 11.5 1.5, 8 1.5 Z" fill="#000" />
                <path d="M8 5.5 C 6.1 5.5, 4.4 6.3, 3.3 7.4 L 5 9.1 C 5.6 8.5, 6.6 8.0, 8 8.0 C 9.4 8.0, 10.4 8.5, 11 9.1 L 12.7 7.4 C 11.6 6.3, 9.9 5.5, 8 5.5 Z" fill="#000" />
                <circle cx="8" cy="10.7" r="1.3" fill="#000" />
              </svg>
              {/* Battery */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1.5px solid #000',
                  borderRadius: '4px',
                  width: '26px',
                  height: '12px',
                  padding: '1px',
                }}
              >
                <div style={{ background: '#000', width: '85%', height: '100%', borderRadius: '1px' }} />
              </div>
            </div>
          </div>

          {/* PASS-CARD (direkt unter Status-Bar, ohne Wallet-Chrome) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              margin: '16px 16px 0 16px',
              background: bg,
              borderRadius: '20px',
              overflow: 'hidden',
              flex: 1,
            }}
          >
            {/* Pass-Header: Logo + KUNDE-ID */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '24px 24px 12px 24px',
              }}
            >
              {logoSrc ? (
                <img
                  src={logoSrc}
                  width={110}
                  height={44}
                  style={{ objectFit: 'contain', maxHeight: '44px', maxWidth: '160px' }}
                  alt=""
                />
              ) : i.industry_emoji ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '48px',
                      height: '48px',
                      borderRadius: '24px',
                      background: 'rgba(255,255,255,0.15)',
                      fontSize: '28px',
                    }}
                  >
                    {i.industry_emoji}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: '20px',
                      fontWeight: 700,
                      color: text,
                      letterSpacing: '0.5px',
                      maxWidth: '180px',
                      overflow: 'hidden',
                    }}
                  >
                    {i.business_name.slice(0, 18)}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: '32px',
                    fontWeight: 700,
                    color: text,
                    letterSpacing: '2px',
                    display: 'flex',
                  }}
                >
                  {i.business_name.toUpperCase().slice(0, 12)}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '2px',
                }}
              >
                <span style={{ fontSize: '11px', color: label, letterSpacing: '1px', fontWeight: 600 }}>
                  KUNDE
                </span>
                <span style={{ fontSize: '15px', color: text, fontWeight: 500, fontFamily: 'monospace' }}>
                  {kundeId}
                </span>
              </div>
            </div>

            {/* Strip / Stempel-Counter-Bereich */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                height: '220px',
                overflow: 'hidden',
              }}
            >
              {stripSrc && (
                <img
                  src={stripSrc}
                  width={460}
                  height={220}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: 0.5,
                  }}
                  alt=""
                />
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '16px 24px',
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
                  <span
                    style={{
                      fontSize: '72px',
                      fontWeight: 800,
                      color: text,
                      lineHeight: 1,
                      letterSpacing: '-2px',
                    }}
                  >
                    {filled} von {maxStamps}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '14px',
                    color: label,
                    letterSpacing: '2px',
                    fontWeight: 600,
                    marginTop: '6px',
                  }}
                >
                  DEINE STEMPEL
                </span>
              </div>
            </div>

            {/* PRÄMIE + FORTSCHRITT */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '18px 24px 10px 24px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxWidth: '55%' }}>
                <span style={{ fontSize: '10px', color: label, letterSpacing: '1.8px', fontWeight: 700 }}>
                  PRÄMIE
                </span>
                <span style={{ fontSize: '16px', color: text, fontWeight: 500, display: 'flex', gap: '5px', lineHeight: 1.2 }}>
                  {rewardEmoji} {reward.slice(0, 24)}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                <span style={{ fontSize: '10px', color: label, letterSpacing: '1.8px', fontWeight: 700 }}>
                  FORTSCHRITT
                </span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {Array.from({ length: maxStamps }).map((_, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        borderRadius: '9px',
                        background: idx < filled ? label : 'rgba(255,255,255,0.12)',
                        border: idx < filled ? 'none' : `1px solid ${label}40`,
                        fontSize: '11px',
                        color: idx < filled ? bg : label,
                      }}
                    >
                      {idx < filled ? stampEmoji : ''}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* QR-Code — zentriert im verbleibenden Raum */}
            <div
              style={{
                display: 'flex',
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
                padding: '10px 24px 24px 24px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  background: '#ffffff',
                  padding: '14px',
                  borderRadius: '10px',
                }}
              >
                <img src={i.qr_data_url} width={180} height={180} alt="" />
              </div>
            </div>
          </div>

          {/* Pass-Pagination-Dots */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '5px',
              padding: '14px 0 10px 0',
            }}
          >
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '3px',
                  background: idx === 3 ? '#4b5563' : '#d1d5db',
                }}
              />
            ))}
          </div>

          {/* Home-Indicator */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '8px 0 12px 0',
            }}
          >
            <div style={{ width: '140px', height: '5px', borderRadius: '3px', background: '#000' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
