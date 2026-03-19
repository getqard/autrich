export type LogoCandidate = {
  url: string
  source: 'apple-touch-icon' | 'og-image' | 'favicon' | 'link-icon' | 'meta-image' | 'header-logo' | 'css-background' | 'inline-svg' | 'picture' | 'manifest-icon' | 'footer-logo' | 'structured-data' | 'mask-icon'
  width: number | null
  height: number | null
  score: number
}

export type CSSColorResult = {
  backgroundColor: string | null
  accentColor: string | null
  headerBackground: string | null
  source: string | null
  confidence: number
  candidates: ColorCandidate[]
}

export type ColorCandidate = {
  hex: string
  role: 'background' | 'accent' | 'text' | 'border'
  source: string
  confidence: number
}

export type PassColorResult = {
  backgroundColor: string
  foregroundColor: string
  labelColor: string
  accentColor: string | null
  logoContrast: 'good' | 'low' | 'unknown'
}

export type WebsiteData = {
  url: string
  finalUrl: string
  title: string | null
  description: string | null
  logoCandidates: LogoCandidate[]
  bestLogo: LogoCandidate | null
  structuredData: Record<string, unknown>
  socialLinks: Record<string, string>
  loyaltyDetected: boolean
  appDetected: boolean
  themeColor: string | null
  brandColors: CSSColorResult
  scrapeDurationMs: number
  error?: string
}

export type LogoValidation = {
  valid: boolean
  width: number
  height: number
  format: string
  fileSize: number
  reason?: string
}

export type LogoVariant = {
  name: string
  width: number
  height: number
  buffer: Buffer
}

export type LogoResult = {
  originalUrl: string
  format: string
  width: number
  height: number
  bgRemoved: boolean
  variants: LogoVariant[]
}

export type ColorResult = {
  dominant: string
  textColor: string
  labelColor: string
  luminance: number
}

export type ClassifyInput = {
  business_name: string
  industry?: string | null
  city?: string | null
  website_description?: string | null
  gmaps_category?: string | null
  categories?: string[]
  has_existing_loyalty?: boolean
  has_app?: boolean
  google_rating?: number | null
  google_reviews_count?: number | null
  social_links?: Record<string, string>
}

export type ClassificationResult = {
  detected_industry: string
  detected_reward: string
  detected_reward_emoji: string
  detected_stamp_emoji: string
  detected_pass_title: string
  detected_max_stamps: number
  strip_prompt: string
  email_hooks: string[]
  personalization_notes: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  duration_ms: number
}
