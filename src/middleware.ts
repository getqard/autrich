import { NextResponse, type NextRequest } from 'next/server'

/**
 * Domain-based routing middleware.
 *
 * deine-treuekarte.de (Download-Domain):
 *   → /d/*              Download pages
 *   → /impressum        Pflicht-Page für Email-Footer-Link (Block 5)
 *   → /datenschutz      DSGVO-Info-Page (Block 5)
 *   → /api/passes/*     Pass downloads
 *   → /api/tracking     Click/visit tracking
 *   → /api/webhooks/*   Instantly webhooks
 *   → /_next/*          Next.js assets (JS, CSS)
 *   → /*.svg|png|webp   Public static assets (wallet badges, WhatsApp icon, etc.)
 *   → Everything else   → 404
 *
 * autrich.vercel.app / localhost (Platform):
 *   → Everything allowed
 */

const DOWNLOAD_DOMAINS = ['deine-treuekarte.de', 'www.deine-treuekarte.de']

// Static asset extensions served from /public
const STATIC_ASSET_PATTERN = /\.(svg|png|jpg|jpeg|webp|ico|gif|woff2?|ttf|css|js)$/i

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''

  // Only restrict on download domain
  if (DOWNLOAD_DOMAINS.some(d => hostname.includes(d))) {
    const path = request.nextUrl.pathname

    const allowed =
      path.startsWith('/d/') ||
      path === '/impressum' ||      // Block 5
      path === '/datenschutz' ||    // Block 5
      path.startsWith('/api/passes/') ||
      path.startsWith('/api/tracking') ||
      path.startsWith('/api/webhooks/') ||
      path.startsWith('/_next/') ||
      path === '/favicon.ico' ||
      path === '/robots.txt' ||
      STATIC_ASSET_PATTERN.test(path) // Allow all static assets (SVG, PNG, WebP, etc.)

    if (!allowed) {
      return new NextResponse(
        '<html><body style="background:#0a0a0a;color:#666;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><p>Seite nicht gefunden</p></body></html>',
        { status: 404, headers: { 'Content-Type': 'text/html' } }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
