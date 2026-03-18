const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'maildrop.cc', 'temp-mail.org', 'fakeinbox.com',
  'trashmail.com', 'mytemp.email', 'tempail.com', 'mohmal.com',
])

export type EmailValidationResult = {
  valid: boolean
  email: string
  error?: string
}

export function validateEmailFormat(email: string): EmailValidationResult {
  const trimmed = email.trim().toLowerCase()

  if (!trimmed) {
    return { valid: false, email: trimmed, error: 'Email ist leer' }
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, email: trimmed, error: 'Ungültiges Email-Format' }
  }

  const domain = trimmed.split('@')[1]

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, email: trimmed, error: 'Disposable Email-Adresse' }
  }

  return { valid: true, email: trimmed }
}

export async function validateEmailMX(email: string): Promise<EmailValidationResult> {
  const formatResult = validateEmailFormat(email)
  if (!formatResult.valid) return formatResult

  // MX Check wird serverseitig über DNS gemacht
  // In der API Route implementiert, nicht im Browser
  return formatResult
}
