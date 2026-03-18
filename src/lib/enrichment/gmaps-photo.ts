import sharp from 'sharp'

/**
 * Fetch a Google Maps photo from a URL (typically lh3.googleusercontent.com).
 * Returns null on error, timeout, or invalid image.
 */
export async function fetchGmapsPhoto(photoUrl: string): Promise<Buffer | null> {
  if (!photoUrl) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(photoUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })
    clearTimeout(timeout)

    if (!response.ok) return null

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Max 5MB
    if (buffer.length > 5 * 1024 * 1024) return null

    // Validate with sharp
    const metadata = await sharp(buffer).metadata()
    const { width = 0, height = 0 } = metadata

    // Min 200x200
    if (width < 200 || height < 200) return null

    return buffer
  } catch {
    return null
  }
}

/**
 * Center-crop an image to a square and resize to 512x512.
 */
export async function cropToSquare(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata()
  const { width = 0, height = 0 } = metadata
  const size = Math.min(width, height)

  // Center crop
  const left = Math.floor((width - size) / 2)
  const top = Math.floor((height - size) / 2)

  return sharp(buffer)
    .extract({ left, top, width: size, height: size })
    .resize(512, 512)
    .png()
    .toBuffer()
}
