/**
 * Apple Wallet Pass Generation
 *
 * Generates signed .pkpass files for Apple Wallet.
 * Uses passkit-generator library with dual cert loading (base64 for prod, file for dev).
 *
 * Reference: ~/Desktop/passify/src/lib/wallet/apple.ts (READ ONLY)
 */

import { PKPass } from 'passkit-generator'
import * as fs from 'fs'
import * as path from 'path'

// ─── Types ──────────────────────────────────────────────────────

export type AppleCertConfig = {
  passTypeIdentifier: string
  teamIdentifier: string
  signerKeyPassphrase: string
  wwdrBuffer?: Buffer
  signerCertBuffer?: Buffer
  signerKeyBuffer?: Buffer
  wwdrPath?: string
  signerCertPath?: string
  signerKeyPath?: string
}

export type ApplePassInput = {
  serial: string
  authToken: string
  businessName: string
  passTitle: string
  backgroundColor: string
  textColor: string
  labelColor: string
  stampEmoji: string
  currentStamps: number
  maxStamps: number
  reward: string
  rewardEmoji?: string
  logoBuffer: Buffer | null
  stripBuffer: Buffer | null
  barcodeUrl: string
  address?: string | null
  phone?: string | null
  openingHours?: string | null
  website?: string | null
  lat?: number | null
  lng?: number | null
  lockscreenMessage?: string | null
}

// ─── Cert Loading ───────────────────────────────────────────────

// Minimal 1x1 PNG fallback icon
const FALLBACK_ICON = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
  'base64'
)

let cachedCerts: AppleCertConfig | null = null

/**
 * Load Apple Wallet certificates.
 * Supports base64 env vars (Vercel) and file paths (local dev).
 */
export function loadAppleCerts(): AppleCertConfig {
  if (cachedCerts) return cachedCerts

  const passTypeId = process.env.APPLE_PASS_TYPE_ID
  const teamId = process.env.APPLE_TEAM_ID
  const passphrase = process.env.APPLE_SIGNER_KEY_PASSPHRASE

  if (!passTypeId || !passphrase) {
    throw new Error('Missing APPLE_PASS_TYPE_ID or APPLE_SIGNER_KEY_PASSPHRASE')
  }

  // Base64 mode (production/Vercel)
  const wwdrB64 = process.env.APPLE_WWDR_CERT_BASE64
  const certB64 = process.env.APPLE_SIGNER_CERT_BASE64
  const keyB64 = process.env.APPLE_SIGNER_KEY_BASE64

  if (wwdrB64 && certB64 && keyB64) {
    cachedCerts = {
      passTypeIdentifier: passTypeId,
      teamIdentifier: teamId || '',
      signerKeyPassphrase: passphrase,
      wwdrBuffer: Buffer.from(wwdrB64, 'base64'),
      signerCertBuffer: Buffer.from(certB64, 'base64'),
      signerKeyBuffer: Buffer.from(keyB64, 'base64'),
    }
    console.log('[Apple] Certs loaded (base64 mode)')
    return cachedCerts
  }

  // File mode (local dev)
  const wwdrPath = process.env.APPLE_WWDR_CERT_PATH
  const certPath = process.env.APPLE_SIGNER_CERT_PATH
  const keyPath = process.env.APPLE_SIGNER_KEY_PATH || certPath

  if (!wwdrPath || !certPath) {
    throw new Error('Missing Apple certs. Set BASE64 env vars (production) or PATH env vars (local dev)')
  }

  const resolve = (p: string) => path.isAbsolute(p) ? p : path.join(process.cwd(), p)

  cachedCerts = {
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId || '',
    signerKeyPassphrase: passphrase,
    wwdrPath: resolve(wwdrPath),
    signerCertPath: resolve(certPath),
    signerKeyPath: resolve(keyPath!),
  }
  console.log('[Apple] Certs loaded (file mode)')
  return cachedCerts
}

/**
 * Validate Apple cert configuration without generating a pass.
 */
export function validateAppleConfig(): { valid: boolean; error?: string; mode?: string } {
  try {
    const certs = loadAppleCerts()
    const mode = certs.wwdrBuffer ? 'base64' : 'file'

    // Verify file mode files exist
    if (mode === 'file') {
      if (!fs.existsSync(certs.wwdrPath!)) return { valid: false, error: `WWDR not found: ${certs.wwdrPath}` }
      if (!fs.existsSync(certs.signerCertPath!)) return { valid: false, error: `Signer cert not found: ${certs.signerCertPath}` }
      if (!fs.existsSync(certs.signerKeyPath!)) return { valid: false, error: `Signer key not found: ${certs.signerKeyPath}` }
    }

    return { valid: true, mode }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Pass Generation ────────────────────────────────────────────

/**
 * Generate a signed .pkpass file for Apple Wallet.
 */
export async function generateApplePass(input: ApplePassInput): Promise<Buffer> {
  const certs = loadAppleCerts()

  // Build stamp emoji visual: 🥙🥙🥙⚪⚪⚪⚪⚪⚪⚪
  const activeStamps = input.stampEmoji.repeat(input.currentStamps)
  const inactiveStamps = '⚪'.repeat(input.maxStamps - input.currentStamps)
  const stampVisual = activeStamps + inactiveStamps

  // Web service config (only HTTPS — Apple rejects HTTP)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
  const webServiceConfig = baseUrl.startsWith('https') ? {
    webServiceURL: `${baseUrl}/api/v1`,
    authenticationToken: input.authToken,
  } : {}

  // Create PKPass (webServiceURL MUST be in constructor, like Passify)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pass = new PKPass(
    {},
    {
      wwdr: certs.wwdrBuffer || fs.readFileSync(certs.wwdrPath!),
      signerCert: certs.signerCertBuffer || fs.readFileSync(certs.signerCertPath!),
      signerKey: certs.signerKeyBuffer || fs.readFileSync(certs.signerKeyPath!),
      signerKeyPassphrase: certs.signerKeyPassphrase,
    },
    {
      passTypeIdentifier: certs.passTypeIdentifier,
      teamIdentifier: certs.teamIdentifier,
      serialNumber: input.serial,
      organizationName: input.businessName,
      description: `${input.passTitle} für ${input.businessName}`,
      formatVersion: 1,
      backgroundColor: input.backgroundColor,
      foregroundColor: input.textColor,
      labelColor: input.labelColor,
      logoText: input.businessName,
      ...webServiceConfig,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  )

  // Pass type
  pass.type = 'storeCard'

  // Barcode (QR → download page)
  pass.setBarcodes({
    message: input.barcodeUrl,
    format: 'PKBarcodeFormatQR',
    messageEncoding: 'iso-8859-1',
  })

  // Header: stamp count
  pass.headerFields.push({
    key: 'stamps',
    label: input.passTitle,
    value: `${input.currentStamps}/${input.maxStamps}`,
  })

  // Primary: stamp emoji visual
  pass.primaryFields.push({
    key: 'progress',
    label: 'FORTSCHRITT',
    value: stampVisual,
  })

  // Secondary: reward
  const rewardText = input.rewardEmoji
    ? `${input.reward} ${input.rewardEmoji}`
    : input.reward
  pass.secondaryFields.push({
    key: 'reward',
    label: 'PRÄMIE',
    value: rewardText,
  })

  // Back fields
  const backFields: Array<{ key: string; label: string; value: string }> = []
  if (input.address) backFields.push({ key: 'address', label: 'ADRESSE', value: input.address })
  if (input.phone) backFields.push({ key: 'phone', label: 'TELEFON', value: input.phone })
  if (input.openingHours) backFields.push({ key: 'hours', label: 'ÖFFNUNGSZEITEN', value: input.openingHours })
  if (input.website) backFields.push({ key: 'website', label: 'WEBSITE', value: input.website })

  for (const field of backFields) {
    pass.backFields.push(field)
  }

  // Images
  const icon = input.logoBuffer || FALLBACK_ICON
  pass.addBuffer('icon.png', icon)
  pass.addBuffer('icon@2x.png', icon)
  pass.addBuffer('logo.png', icon)
  pass.addBuffer('logo@2x.png', icon)

  if (input.stripBuffer) {
    pass.addBuffer('strip.png', input.stripBuffer)
    pass.addBuffer('strip@2x.png', input.stripBuffer)
  }

  // Location relevance
  if (input.lat && input.lng) {
    pass.setLocations({
      latitude: input.lat,
      longitude: input.lng,
      relevantText: input.lockscreenMessage || `Vergiss deinen Stempel nicht! ${input.stampEmoji}`,
    })
  }

  return pass.getAsBuffer()
}
