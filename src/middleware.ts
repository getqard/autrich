import { NextResponse, type NextRequest } from 'next/server'

/**
 * Domain-based routing middleware.
 *
 * erfolgssinn.de (Download-Domain):
 *   → Only /d/*, /api/passes/*, /api/tracking, /api/webhooks/* allowed
 *   → Everything else → 404
 *
 * autrich.vercel.app / localhost (Platform):
 *   → Everything allowed
 */

const DOWNLOAD_DOMAINS = ['erfolgssinn.de', 'www.erfolgssinn.de']

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''

  // Only restrict on download domain
  if (DOWNLOAD_DOMAINS.some(d => hostname.includes(d))) {
    const path = request.nextUrl.pathname

    const allowed =
      path.startsWith('/d/') ||
      path.startsWith('/api/passes/') ||
      path.startsWith('/api/tracking') ||
      path.startsWith('/api/webhooks/') ||
      path.startsWith('/_next/') ||
      path === '/favicon.ico' ||
      path === '/robots.txt'

    if (!allowed) {
      // Return a simple 404 page
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
