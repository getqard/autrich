import { NextResponse } from 'next/server'
import { PKPass } from 'passkit-generator'
import * as fs from 'fs'
import { randomUUID } from 'crypto'

/**
 * GET /api/tools/pass-test
 *
 * Generates a MINIMAL Apple .pkpass and serves it directly.
 * No images, no storage — pure cert + PKPass test.
 * If this works on iPhone, certs are valid and the issue is elsewhere.
 */
export async function GET() {
  try {
    // Load certs
    const wwdrB64 = process.env.APPLE_WWDR_CERT_BASE64
    const certB64 = process.env.APPLE_SIGNER_CERT_BASE64
    const keyB64 = process.env.APPLE_SIGNER_KEY_BASE64
    const passTypeId = process.env.APPLE_PASS_TYPE_ID
    const teamId = process.env.APPLE_TEAM_ID
    const passphrase = process.env.APPLE_SIGNER_KEY_PASSPHRASE

    if (!wwdrB64 || !certB64 || !keyB64 || !passTypeId || !passphrase) {
      return NextResponse.json({ error: 'Missing Apple cert env vars' }, { status: 500 })
    }

    // Minimal 1x1 PNG icon (required by Apple)
    const minIcon = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
      'base64'
    )

    const serial = randomUUID()

    // Create minimal pass
    const pass = new PKPass(
      {},
      {
        wwdr: Buffer.from(wwdrB64, 'base64'),
        signerCert: Buffer.from(certB64, 'base64'),
        signerKey: Buffer.from(keyB64, 'base64'),
        signerKeyPassphrase: passphrase,
      },
      {
        passTypeIdentifier: passTypeId,
        teamIdentifier: teamId || '',
        serialNumber: serial,
        organizationName: 'Autrich Test',
        description: 'Test Treuekarte',
        formatVersion: 1,
        backgroundColor: '#1a1a2e',
        foregroundColor: '#ffffff',
        labelColor: '#d4a574',
        logoText: 'Test Pass',
      } as any
    )

    pass.type = 'storeCard'

    // Minimal icon only
    pass.addBuffer('icon.png', minIcon)
    pass.addBuffer('icon@2x.png', minIcon)

    // Fields (like Passify layout)
    pass.primaryFields.push({
      key: 'stamps',
      label: 'DEINE STEMPEL',
      value: '3 von 10',
    })

    pass.secondaryFields.push({
      key: 'reward',
      label: 'PRÄMIE',
      value: '1 Gratis Kaffee ☕',
    })

    pass.auxiliaryFields.push({
      key: 'progress_visual',
      label: 'FORTSCHRITT',
      value: '☕ ☕ ☕ ⚪ ⚪ ⚪ ⚪ ⚪ ⚪ ⚪',
    })

    pass.setBarcodes({
      message: process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL || 'https://deine-treuekarte.de',
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    })

    const buffer = pass.getAsBuffer()

    console.log(`[Pass Test] Generated minimal .pkpass: ${buffer.length} bytes`)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Last-Modified': new Date().toUTCString(),
      },
    })
  } catch (err) {
    console.error('[Pass Test] FAILED:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 })
  }
}
