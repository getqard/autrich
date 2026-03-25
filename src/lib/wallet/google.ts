/**
 * Google Wallet Pass Generation
 *
 * Generates Google Wallet save links via signed JWT.
 * Uses the "class embedded in JWT" approach — no pre-creation API calls needed.
 *
 * Reference: ~/Desktop/passify/src/lib/wallet/google.ts (READ ONLY)
 */

import jwt from 'jsonwebtoken'

// ─── Types ──────────────────────────────────────────────────────

type GoogleServiceAccount = {
  client_email: string
  private_key: string
  project_id?: string
}

export type GooglePassInput = {
  serial: string
  businessName: string
  passTitle: string
  backgroundColor: string
  stampEmoji: string
  currentStamps: number
  maxStamps: number
  reward: string
  rewardEmoji?: string
  barcodeUrl: string
  logoPublicUrl: string | null
  stripPublicUrl: string | null
  address?: string | null
  phone?: string | null
  openingHours?: string | null
  website?: string | null
  lat?: number | null
  lng?: number | null
}

export type GoogleSaveLinkResult = {
  url: string
  jwt: string
}

// ─── Credential Loading ─────────────────────────────────────────

let cachedCreds: { serviceAccount: GoogleServiceAccount; issuerId: string } | null = null

export function loadGoogleCredentials(): { serviceAccount: GoogleServiceAccount; issuerId: string } {
  if (cachedCreds) return cachedCreds

  const issuerId = process.env.GOOGLE_ISSUER_ID
  if (!issuerId) throw new Error('Missing GOOGLE_ISSUER_ID')

  // Base64 mode (production)
  const saBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64
  if (saBase64) {
    const serviceAccount = JSON.parse(Buffer.from(saBase64, 'base64').toString('utf8')) as GoogleServiceAccount
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('Invalid service account JSON: missing client_email or private_key')
    }
    cachedCreds = { serviceAccount, issuerId }
    console.log('[Google] Credentials loaded (base64 mode)')
    return cachedCreds
  }

  // File mode (local dev)
  const saPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
  if (saPath) {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const resolved = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath)
    const serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8')) as GoogleServiceAccount
    cachedCreds = { serviceAccount, issuerId }
    console.log('[Google] Credentials loaded (file mode)')
    return cachedCreds
  }

  throw new Error('Missing Google creds. Set GOOGLE_SERVICE_ACCOUNT_BASE64 or GOOGLE_SERVICE_ACCOUNT_KEY_PATH')
}

export function validateGoogleConfig(): { valid: boolean; error?: string; mode?: string } {
  try {
    const { serviceAccount } = loadGoogleCredentials()
    const mode = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 ? 'base64' : 'file'

    if (!serviceAccount.private_key?.includes('BEGIN')) {
      return { valid: false, error: 'Service account private_key looks invalid' }
    }

    return { valid: true, mode }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Save Link Generation ───────────────────────────────────────

/**
 * Generate a Google Wallet "Add to Wallet" save link.
 * Embeds both the loyalty class and object in the JWT.
 */
export function generateGoogleSaveLink(input: GooglePassInput): GoogleSaveLinkResult {
  const { serviceAccount, issuerId } = loadGoogleCredentials()

  const classId = `${issuerId}.autrich_${input.serial.replace(/-/g, '_')}`
  const objectId = `${issuerId}.pass_${input.serial.replace(/-/g, '_')}`

  // Build stamp visual
  const stampVisual = input.stampEmoji.repeat(input.currentStamps) + '⚪'.repeat(input.maxStamps - input.currentStamps)
  const progressText = `${input.currentStamps}/${input.maxStamps}`

  // Loyalty Class (template)
  const loyaltyClass: Record<string, unknown> = {
    id: classId,
    issuerName: input.businessName,
    programName: input.passTitle,
    reviewStatus: 'UNDER_REVIEW',
    multipleDevicesAndHoldersAllowedStatus: 'MULTIPLE_HOLDERS',
    hexBackgroundColor: input.backgroundColor,
  }

  if (input.logoPublicUrl && isValidUrl(input.logoPublicUrl)) {
    loyaltyClass.programLogo = {
      sourceUri: { uri: input.logoPublicUrl },
      contentDescription: { defaultValue: { language: 'de', value: input.businessName } },
    }
  }

  if (input.stripPublicUrl && isValidUrl(input.stripPublicUrl)) {
    loyaltyClass.heroImage = {
      sourceUri: { uri: input.stripPublicUrl },
      contentDescription: { defaultValue: { language: 'de', value: 'Banner' } },
    }
  }

  if (input.lat && input.lng) {
    loyaltyClass.locations = [{
      kind: 'walletobjects#latLongPoint',
      latitude: input.lat,
      longitude: input.lng,
    }]
  }

  // Loyalty Object (instance)
  const rewardText = input.rewardEmoji ? `${input.reward} ${input.rewardEmoji}` : input.reward

  const textModulesData: Array<{ id: string; header: string; body: string }> = [
    { id: 'stamps', header: 'FORTSCHRITT', body: stampVisual },
    { id: 'reward', header: 'PRÄMIE', body: rewardText },
  ]

  if (input.address) textModulesData.push({ id: 'address', header: 'ADRESSE', body: input.address })
  if (input.phone) textModulesData.push({ id: 'phone', header: 'TELEFON', body: input.phone })

  const loyaltyObject: Record<string, unknown> = {
    id: objectId,
    classId: classId,
    state: 'ACTIVE',
    accountId: input.serial.substring(0, 8).toUpperCase(),
    loyaltyPoints: {
      label: 'STEMPEL',
      balance: { string: progressText },
    },
    barcode: {
      type: 'QR_CODE',
      value: input.barcodeUrl,
      alternateText: input.serial.substring(0, 8).toUpperCase(),
    },
    textModulesData,
  }

  // Build and sign JWT
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'
  const origins = [baseUrl, 'https://autrich.vercel.app', 'http://localhost:3000']
    .filter((v, i, a) => a.indexOf(v) === i) // dedupe

  const claims = {
    iss: serviceAccount.client_email,
    aud: 'google',
    origins,
    typ: 'savetowallet',
    payload: {
      loyaltyClasses: [loyaltyClass],
      loyaltyObjects: [loyaltyObject],
    },
  }

  const token = jwt.sign(claims, serviceAccount.private_key, { algorithm: 'RS256' })

  return {
    url: `https://pay.google.com/gp/v/save/${token}`,
    jwt: token,
  }
}

function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
