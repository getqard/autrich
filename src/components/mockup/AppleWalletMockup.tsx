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
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {/* Signal-Bars */}
              <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
                {[4, 6, 8, 10].map(h => (
                  <div key={h} style={{ width: '3px', height: `${h}px`, background: '#000', borderRadius: '1px' }} />
                ))}
              </div>
              {/* WiFi — 3 konzentrische Kreisbögen simuliert über Border */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '1px',
                  marginLeft: '4px',
                }}
              >
                {[5, 8, 11, 14].map(h => (
                  <div
                    key={h}
                    style={{
                      width: '3px',
                      height: `${h}px`,
                      background: '#000',
                      borderRadius: '1px',
                    }}
                  />
                ))}
              </div>
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
                  marginLeft: '4px',
                }}
              >
                <div style={{ background: '#000', width: '85%', height: '100%', borderRadius: '1px' }} />
              </div>
            </div>
          </div>

          {/* Wallet-Navigation-Header (X-Button + Share) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 20px',
              height: '44px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                background: 'rgba(255,255,255,0.9)',
                borderRadius: '18px',
                fontSize: '18px',
                fontWeight: 500,
                color: '#6b7280',
              }}
            >
              ✕
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '48px',
                  height: '32px',
                  background: 'rgba(255,255,255,0.9)',
                  borderRadius: '16px',
                  fontSize: '14px',
                  color: '#6b7280',
                }}
              >
                ↑
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '48px',
                  height: '32px',
                  background: 'rgba(255,255,255,0.9)',
                  borderRadius: '16px',
                  fontSize: '16px',
                  color: '#6b7280',
                  letterSpacing: '1px',
                }}
              >
                ⋯
              </div>
            </div>
          </div>

          {/* PASS-CARD */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              margin: '4px 16px 0 16px',
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
                padding: '16px 24px 16px 24px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: label, letterSpacing: '1.5px', fontWeight: 700 }}>
                  PRÄMIE
                </span>
                <span style={{ fontSize: '15px', color: text, fontWeight: 500, display: 'flex', gap: '4px' }}>
                  {rewardEmoji} {reward.slice(0, 22)}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: label, letterSpacing: '1.5px', fontWeight: 700 }}>
                  FORTSCHRITT
                </span>
                <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                  {Array.from({ length: maxStamps }).map((_, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '14px',
                        height: '14px',
                        borderRadius: '7px',
                        background: idx < filled ? label : 'rgba(255,255,255,0.15)',
                        fontSize: '9px',
                        color: idx < filled ? bg : label,
                      }}
                    >
                      {idx < filled ? stampEmoji : ''}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* QR-Code */}
            <div
              style={{
                display: 'flex',
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
                padding: '4px 24px 28px 24px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  background: '#ffffff',
                  padding: '12px',
                  borderRadius: '8px',
                }}
              >
                <img src={i.qr_data_url} width={160} height={160} alt="" />
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
