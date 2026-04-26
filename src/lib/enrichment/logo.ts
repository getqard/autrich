import sharp from 'sharp'
import type { LogoResult, LogoVariant, LogoValidation } from './types'

/**
 * Lightweight validation: download + check dimensions/format without resizing.
 */
export async function validateLogoCandidate(url: string): Promise<LogoValidation> {
  try {
    let buffer: Buffer

    // Handle data: URIs (inline SVGs, base64 images)
    if (url.startsWith('data:')) {
      const commaIdx = url.indexOf(',')
      if (commaIdx === -1) {
        return { valid: false, width: 0, height: 0, format: 'unknown', fileSize: 0, reason: 'Invalid data: URI' }
      }
      const header = url.substring(0, commaIdx).toLowerCase()
      const data = url.substring(commaIdx + 1)
      buffer = header.includes('base64')
        ? Buffer.from(data, 'base64')
        : Buffer.from(decodeURIComponent(data))
    } else {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })
      clearTimeout(timeout)

      if (!response.ok) {
        return { valid: false, width: 0, height: 0, format: 'unknown', fileSize: 0, reason: `HTTP ${response.status}` }
      }

      const arrayBuffer = await response.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    }
    const fileSize = buffer.length

    if (fileSize < 500) {
      return { valid: false, width: 0, height: 0, format: 'unknown', fileSize, reason: 'Zu klein (<500 bytes, Tracking-Pixel?)' }
    }

    const metadata = await sharp(buffer).metadata()
    const { width = 0, height = 0, format = 'unknown' } = metadata

    // SVGs report 0x0 from sharp metadata before rasterization — allow them
    if (format === 'svg') {
      return { valid: true, width: 512, height: 512, format: 'svg', fileSize }
    }

    if (width < 64 || height < 64) {
      return { valid: false, width, height, format: format || 'unknown', fileSize, reason: `Zu klein (${width}x${height}, min 64x64)` }
    }

    if (width > 2000 || height > 2000) {
      return { valid: false, width, height, format: format || 'unknown', fileSize, reason: `Zu gross (${width}x${height}, max 2000x2000)` }
    }

    const aspectRatio = Math.max(width, height) / Math.min(width, height)
    if (aspectRatio > 2.8) {
      return { valid: false, width, height, format: format || 'unknown', fileSize, reason: `Seitenverhältnis zu breit (${aspectRatio.toFixed(1)}:1)` }
    }

    return { valid: true, width, height, format: format || 'unknown', fileSize }
  } catch (err) {
    return {
      valid: false, width: 0, height: 0, format: 'unknown', fileSize: 0,
      reason: err instanceof Error ? err.message : 'Download fehlgeschlagen',
    }
  }
}

const VARIANTS: Array<{ name: string; size: number }> = [
  { name: 'icon', size: 29 },
  { name: 'icon@2x', size: 58 },
  { name: 'icon@3x', size: 87 },
  { name: 'logo', size: 160 },
  { name: 'logo@2x', size: 320 },
  { name: 'thumbnail', size: 256 },
]

export async function processLogo(
  imageSource: string | Buffer,
  bgColor?: string
): Promise<LogoResult> {
  // Download if URL
  let buffer: Buffer
  let originalUrl = ''

  if (typeof imageSource === 'string') {
    originalUrl = imageSource

    // Handle data: URIs
    if (imageSource.startsWith('data:')) {
      const commaIdx = imageSource.indexOf(',')
      if (commaIdx === -1) throw new Error('Invalid data: URI')
      const header = imageSource.substring(0, commaIdx).toLowerCase()
      const data = imageSource.substring(commaIdx + 1)
      buffer = header.includes('base64')
        ? Buffer.from(data, 'base64')
        : Buffer.from(decodeURIComponent(data))
    } else {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(imageSource, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })
      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`Logo Download fehlgeschlagen: HTTP ${response.status}`)
      }

      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
        throw new Error('Logo zu gross (>5MB)')
      }

      const arrayBuffer = await response.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    }
  } else {
    buffer = imageSource
  }

  // Get metadata
  const metadata = await sharp(buffer).metadata()
  const { width = 0, height = 0, format = 'unknown' } = metadata

  // SVG handling
  if (format === 'svg') {
    buffer = await sharp(buffer).png().resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
    const newMeta = await sharp(buffer).metadata()
    Object.assign(metadata, newMeta)
  }

  // Validation
  if (width < 64 || height < 64) {
    throw new Error(`Logo zu klein (${width}x${height}, min 64x64)`)
  }

  const aspectRatio = Math.max(width, height) / Math.min(width, height)
  if (aspectRatio > 2.8) {
    throw new Error(`Seitenverhältnis zu breit (${aspectRatio.toFixed(1)}:1, max 2.8:1)`)
  }

  // Background detection + removal
  let bgRemoved = false
  try {
    const cornerSize = 1
    const corners = await Promise.all([
      sharp(buffer).extract({ left: 0, top: 0, width: cornerSize, height: cornerSize }).raw().toBuffer(),
      sharp(buffer).extract({ left: width - 1, top: 0, width: cornerSize, height: cornerSize }).raw().toBuffer(),
      sharp(buffer).extract({ left: 0, top: height - 1, width: cornerSize, height: cornerSize }).raw().toBuffer(),
      sharp(buffer).extract({ left: width - 1, top: height - 1, width: cornerSize, height: cornerSize }).raw().toBuffer(),
    ])

    const isWhiteBg = corners.every(corner => {
      const r = corner[0], g = corner[1], b = corner[2]
      return r >= 240 && g >= 240 && b >= 240
    })

    if (isWhiteBg) {
      buffer = await sharp(buffer)
        .ensureAlpha()
        .trim({ threshold: 20 })
        .toBuffer()
      bgRemoved = true
    }
  } catch {
    // Corner extraction can fail on edge cases, skip BG removal
  }

  // Generate variants
  const variants: LogoVariant[] = await Promise.all(
    VARIANTS.map(async ({ name, size }) => {
      const variantBuffer = await sharp(buffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer()

      return {
        name,
        width: size,
        height: size,
        buffer: variantBuffer,
      }
    })
  )

  return {
    originalUrl,
    format: format === 'svg' ? 'svg (converted to png)' : (format || 'unknown'),
    width,
    height,
    bgRemoved,
    variants,
  }
}

// ─── New: Google Favicon API ────────────────────────────────

/**
 * Fetch a favicon from Google's Favicon API (128px).
 * Returns null if 404 or the generic globe icon (726 bytes).
 */
export async function fetchGoogleFavicon(domain: string): Promise<Buffer | null> {
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim()

  if (!cleanDomain) return null

  const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain)}&sz=128`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) return null

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Google returns a 726-byte globe icon for unknown domains
    if (buffer.length <= 726) return null

    return buffer
  } catch {
    return null
  }
}

// ─── New: Initials Logo Generator ───────────────────────────

/**
 * Generate a logo with the business name's initials on a colored circle.
 * "Döner Palace" → "DP", "Café Müller" → "CM"
 */
export async function generateInitialsLogo(name: string, bgColor: string): Promise<Buffer> {
  const initials = name
    .split(/[\s\-&]+/)
    .filter(w => w.length > 0)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
    || name.substring(0, 2).toUpperCase()

  // Determine text color based on bg luminance
  const h = bgColor.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const textColor = lum > 0.5 ? '#1a1a1a' : '#ffffff'

  const size = 512
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${bgColor}"/>
      <text
        x="${size / 2}"
        y="${size / 2}"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif"
        font-weight="bold"
        font-size="${initials.length === 1 ? 240 : 200}"
        fill="${textColor}"
      >${initials}</text>
    </svg>
  `.trim()

  return sharp(Buffer.from(svg))
    .png()
    .resize(size, size)
    .toBuffer()
}
