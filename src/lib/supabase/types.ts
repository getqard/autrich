export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      campaigns: {
        Row: Campaign
        Insert: CampaignInsert
        Update: Partial<CampaignInsert>
      }
      leads: {
        Row: Lead
        Insert: LeadInsert
        Update: Partial<LeadInsert>
      }
      industries: {
        Row: Industry
        Insert: IndustryInsert
        Update: Partial<IndustryInsert>
      }
      cities: {
        Row: City
        Insert: CityInsert
        Update: Partial<CityInsert>
      }
      scrape_plans: {
        Row: ScrapePlan
        Insert: ScrapePlanInsert
        Update: Partial<ScrapePlanInsert>
      }
      scrape_jobs: {
        Row: ScrapeJob
        Insert: ScrapeJobInsert
        Update: Partial<ScrapeJobInsert>
      }
      scrape_results_raw: {
        Row: ScrapeResultRaw
        Insert: ScrapeResultRawInsert
        Update: Partial<ScrapeResultRawInsert>
      }
      email_providers: {
        Row: EmailProvider
        Insert: EmailProviderInsert
        Update: Partial<EmailProviderInsert>
      }
      email_verifiers: {
        Row: EmailVerifier
        Insert: EmailVerifierInsert
        Update: Partial<EmailVerifierInsert>
      }
      website_scrape_cache: {
        Row: WebsiteScrapeCache
        Insert: WebsiteScrapeCacheInsert
        Update: Partial<WebsiteScrapeCacheInsert>
      }
      email_contacts: {
        Row: EmailContact
        Insert: EmailContactInsert
        Update: Partial<EmailContactInsert>
      }
      strip_templates: {
        Row: StripTemplate
        Insert: StripTemplateInsert
        Update: Partial<StripTemplateInsert>
      }
      email_templates: {
        Row: {
          id: string
          campaign_id: string | null
          variant: string
          type: string
          strategy: EmailStrategy
          system_prompt: string
          example_output: string | null
          stats: Record<string, number>
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id?: string | null
          variant: string
          type: string
          strategy: EmailStrategy
          system_prompt: string
          example_output?: string | null
          stats?: Record<string, number>
        }
        Update: Partial<Database['public']['Tables']['email_templates']['Insert']>
      }
      tracking_events: {
        Row: {
          id: string
          lead_id: string
          event_type: TrackingEventType
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          event_type: TrackingEventType
          metadata?: Json
        }
        Update: Partial<Database['public']['Tables']['tracking_events']['Insert']>
      }
      sender_domains: {
        Row: {
          id: string
          domain: string
          mailboxes: string[]
          warmup_status: DomainWarmupStatus
          health_score: number
          emails_sent_today: number
          emails_sent_total: number
          last_health_check: string | null
          instantly_account_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          domain: string
          mailboxes?: string[]
          warmup_status?: DomainWarmupStatus
          health_score?: number
        }
        Update: Partial<Database['public']['Tables']['sender_domains']['Insert']>
      }
      device_registrations: {
        Row: {
          id: string
          device_library_identifier: string
          pass_type_identifier: string
          serial_number: string
          push_token: string
          lead_id: string
          created_at: string
        }
        Insert: {
          id?: string
          device_library_identifier: string
          pass_type_identifier: string
          serial_number: string
          push_token: string
          lead_id: string
        }
        Update: Partial<Database['public']['Tables']['device_registrations']['Insert']>
      }
      blacklist: {
        Row: {
          id: string
          email: string
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          reason?: string | null
        }
        Update: Partial<Database['public']['Tables']['blacklist']['Insert']>
      }
      settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['settings']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// ============================================
// DOMAIN TYPES — Industries & Regions
// ============================================

export type Industry = {
  id: string
  slug: string
  name: string
  search_terms: string[]
  emoji: string | null
  default_reward: string | null
  default_stamp_emoji: string | null
  default_max_stamps: number
  gmaps_category: string | null
  is_active: boolean
  created_at: string
}

export type IndustryInsert = {
  id?: string
  slug: string
  name: string
  search_terms?: string[]
  emoji?: string | null
  default_reward?: string | null
  default_stamp_emoji?: string | null
  default_max_stamps?: number
  gmaps_category?: string | null
  is_active?: boolean
}

export type City = {
  id: string
  name: string
  bundesland: string
  lat: number | null
  lng: number | null
  population: number
  is_major_city: boolean
  created_at: string
}

export type CityInsert = {
  id?: string
  name: string
  bundesland: string
  lat?: number | null
  lng?: number | null
  population?: number
  is_major_city?: boolean
}

// ============================================
// DOMAIN TYPES — Scraping
// ============================================

export type ScrapePlanStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed'

export type ScrapePlan = {
  id: string
  name: string
  industry_id: string | null
  quality_filter: QualityFilter
  auto_import: boolean
  status: ScrapePlanStatus
  total_jobs: number
  completed_jobs: number
  total_leads_found: number
  total_leads_imported: number
  total_duplicates: number
  created_at: string
  updated_at: string
}

export type ScrapePlanInsert = {
  id?: string
  name: string
  industry_id?: string | null
  quality_filter?: QualityFilter
  auto_import?: boolean
  status?: ScrapePlanStatus
  total_jobs?: number
  completed_jobs?: number
  total_leads_found?: number
  total_leads_imported?: number
  total_duplicates?: number
}

export type QualityFilter = {
  min_rating?: number
  min_reviews?: number
  has_website?: boolean
  has_phone?: boolean
}

export type ScrapeJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled'
export type ScrapeJobReviewStatus = 'pending' | 'reviewed' | 'imported' | 'rejected'

export type ScrapeJob = {
  id: string
  plan_id: string | null
  industry_id: string | null
  city_id: string | null
  search_query: string
  status: ScrapeJobStatus
  quality_filter: QualityFilter
  auto_import: boolean
  review_status: ScrapeJobReviewStatus
  results_count: number
  imported_count: number
  duplicates_count: number
  filtered_count: number
  duration_ms: number | null
  error_message: string | null
  gmaps_task_id: number | null
  cancelled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export type ScrapeJobInsert = {
  id?: string
  plan_id?: string | null
  industry_id?: string | null
  city_id?: string | null
  search_query: string
  status?: ScrapeJobStatus
  quality_filter?: QualityFilter
  auto_import?: boolean
  review_status?: ScrapeJobReviewStatus
  results_count?: number
  imported_count?: number
  duplicates_count?: number
  filtered_count?: number
  duration_ms?: number | null
  error_message?: string | null
  gmaps_task_id?: number | null
  cancelled_at?: string | null
  started_at?: string | null
  completed_at?: string | null
}

export type ScrapeResultRaw = {
  id: string
  job_id: string
  gmaps_place_id: string | null
  name: string
  address: string | null
  city: string | null
  postal_code: string | null
  bundesland: string | null
  phone: string | null
  website: string | null
  email: string | null
  rating: number | null
  reviews_count: number
  category: string | null
  categories: string[]
  lat: number | null
  lng: number | null
  photos: string[]
  opening_hours: Json | null
  social_links: Record<string, string>
  raw_data: Json
  imported: boolean
  lead_id: string | null
  normalized_domain: string | null
  passes_filter: boolean | null
  created_at: string
}

export type ScrapeResultRawInsert = {
  id?: string
  job_id: string
  gmaps_place_id?: string | null
  name: string
  address?: string | null
  city?: string | null
  postal_code?: string | null
  bundesland?: string | null
  phone?: string | null
  website?: string | null
  email?: string | null
  rating?: number | null
  reviews_count?: number
  category?: string | null
  categories?: string[]
  lat?: number | null
  lng?: number | null
  photos?: string[]
  opening_hours?: Json | null
  social_links?: Record<string, string>
  raw_data?: Json
  imported?: boolean
  lead_id?: string | null
  normalized_domain?: string | null
  passes_filter?: boolean | null
}

// ============================================
// DOMAIN TYPES — Email Providers & Verifiers
// ============================================

export type EmailProvider = {
  id: string
  name: string
  display_name: string
  api_key_setting: string | null
  enabled: boolean
  priority: number
  config: Json
  created_at: string
}

export type EmailProviderInsert = {
  id?: string
  name: string
  display_name: string
  api_key_setting?: string | null
  enabled?: boolean
  priority?: number
  config?: Json
}

export type EmailVerifier = {
  id: string
  name: string
  display_name: string
  api_key_setting: string | null
  enabled: boolean
  created_at: string
}

export type EmailVerifierInsert = {
  id?: string
  name: string
  display_name: string
  api_key_setting?: string | null
  enabled?: boolean
}

// ============================================
// DOMAIN TYPES — Campaigns
// ============================================

export type CampaignStatus = 'draft' | 'processing' | 'ready' | 'active' | 'paused' | 'completed'

export type CampaignSettings = {
  ab_variants?: number
  ab_variables?: string[]
  email_strategies?: EmailStrategy[]
  sending_schedule?: {
    days?: string[]
    hours?: string[]
  }
  calendly_url?: string
  review_mode?: boolean
}

export type Campaign = {
  id: string
  name: string
  status: CampaignStatus
  total_leads: number
  processed_leads: number
  settings: CampaignSettings
  lead_filter: LeadFilter
  lead_count_matched: number
  industry_id: string | null
  created_at: string
  updated_at: string
}

export type CampaignInsert = {
  id?: string
  name: string
  status?: CampaignStatus
  total_leads?: number
  processed_leads?: number
  settings?: CampaignSettings
  lead_filter?: LeadFilter
  lead_count_matched?: number
  industry_id?: string | null
}

export type LeadFilter = {
  industry?: string
  city?: string
  bundesland?: string
  has_email?: boolean
  min_score?: number
  contact_status?: ContactStatus
  source?: LeadSource
}

// ============================================
// DOMAIN TYPES — Leads
// ============================================

export type ContactStatus = 'unberuehrt' | 'kontaktiert' | 'geantwortet' | 'kunde' | 'blacklisted'
export type LeadSource = 'csv' | 'scraping' | 'manual'

export type Lead = {
  id: string
  campaign_id: string | null
  // Import
  business_name: string
  industry: string | null
  website_url: string | null
  email: string | null
  phone: string | null
  city: string | null
  address: string | null
  contact_name: string | null
  // v2 — Global Pool
  gmaps_place_id: string | null
  contact_status: ContactStatus
  email_verified: boolean
  email_verify_result: EmailVerifyResult | null
  email_candidates: EmailCandidate[]
  active_campaign_id: string | null
  source: LeadSource
  scrape_job_id: string | null
  bundesland: string | null
  postal_code: string | null
  lat: number | null
  lng: number | null
  gmaps_category: string | null
  gmaps_photos: string[]
  // Enrichment
  enrichment_status: EnrichmentStatus
  logo_url: string | null
  logo_source: LogoSource | null
  dominant_color: string | null
  accent_color: string | null
  text_color: string | null
  label_color: string | null
  detected_industry: string | null
  detected_reward: string | null
  detected_reward_emoji: string | null
  detected_stamp_emoji: string | null
  detected_pass_title: string | null
  detected_max_stamps: number
  strip_prompt: string | null
  email_hooks: string[]
  personalization_notes: string | null
  website_description: string | null
  instagram_handle: string | null
  instagram_bio: string | null
  instagram_avatar_url: string | null
  instagram_followers: number | null
  google_rating: number | null
  google_reviews_count: number | null
  opening_hours: Json | null
  has_existing_loyalty: boolean
  has_app: boolean
  social_links: Record<string, string>
  structured_data: Json
  extra_data: Json
  // Pass
  pass_status: PassStatus
  apple_pass_url: string | null
  google_pass_url: string | null
  download_page_slug: string | null
  strip_image_url: string | null
  strip_source: StripSource | null
  preview_image_url: string | null
  pass_serial: string | null
  pass_auth_token: string | null
  pass_installed: boolean
  pass_installed_at: string | null
  pass_installed_platform: string | null
  pass_installed_device_id: string | null
  // Email
  email_status: EmailStatus
  email_subject: string | null
  email_body: string | null
  email_variant: string | null
  email_strategy: EmailStrategy | null
  email_sent_at: string | null
  email_opened_at: string | null
  email_clicked_at: string | null
  email_replied_at: string | null
  instantly_lead_id: string | null
  instantly_campaign_id: string | null
  // Reply
  reply_text: string | null
  reply_category: ReplyCategory | null
  reply_confidence: number | null
  reply_classified_at: string | null
  reply_draft: string | null
  // Follow-up
  followup_stage: number
  followup_branch: FollowupBranch | null
  next_followup_at: string | null
  // Pipeline
  pipeline_status: PipelineStatus
  lead_score: number
  recycling_count: number
  recycling_pool: RecyclingPool | null
  notes: string | null
  // Timestamps
  created_at: string
  updated_at: string
}

export type LeadInsert = {
  id?: string
  campaign_id?: string | null
  business_name: string
  email?: string | null
  industry?: string | null
  website_url?: string | null
  phone?: string | null
  city?: string | null
  address?: string | null
  contact_name?: string | null
  gmaps_place_id?: string | null
  contact_status?: ContactStatus
  email_verified?: boolean
  email_verify_result?: EmailVerifyResult | null
  email_candidates?: EmailCandidate[]
  active_campaign_id?: string | null
  source?: LeadSource
  scrape_job_id?: string | null
  bundesland?: string | null
  postal_code?: string | null
  lat?: number | null
  lng?: number | null
  gmaps_category?: string | null
  gmaps_photos?: string[]
  [key: string]: unknown
}

export type EmailCandidate = {
  email: string
  source: string
  confidence: number
}

export type EmailVerifyResult = 'valid' | 'invalid' | 'risky' | 'unknown'

// ============================================
// SHARED ENUMS
// ============================================

export type EnrichmentStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type PassStatus = 'pending' | 'generating' | 'ready' | 'failed'
export type EmailStatus = 'pending' | 'review' | 'queued' | 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced'
export type PipelineStatus = 'new' | 'contacted' | 'engaged' | 'interested' | 'demo_scheduled' | 'converted' | 'warm' | 'lost' | 'blacklisted'
export type ReplyCategory = 'interested' | 'not_now' | 'not_interested' | 'unsubscribe' | 'question' | 'needs_review'
export type FollowupBranch = 'not_opened' | 'opened_no_click' | 'clicked_no_install' | 'installed_no_reply'
export type RecyclingPool = 'cold' | 'warm' | 'not_now'
export type LogoSource = 'brandfetch' | 'brandfetch-lettermark' | 'website' | 'gmaps' | 'favicon' | 'instagram' | 'google' | 'generated'
export type StripSource = 'template' | 'ai_generated'
export type EmailStrategy = 'curiosity' | 'social_proof' | 'direct' | 'storytelling' | 'provocation'
export type DomainWarmupStatus = 'warming' | 'ready' | 'paused' | 'blacklisted'

// ============================================
// DOMAIN TYPES — Website Scrape Cache
// ============================================

export type WebsiteScrapeCache = {
  id: string
  normalized_domain: string
  scrape_result: Json
  logo_storage_path: string | null
  logo_source: string | null
  screenshot_storage_path: string | null
  pass_colors: Json | null
  http_status: number | null
  scrape_error: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

export type WebsiteScrapeCacheInsert = {
  id?: string
  normalized_domain: string
  scrape_result: Json
  logo_storage_path?: string | null
  logo_source?: string | null
  screenshot_storage_path?: string | null
  pass_colors?: Json | null
  http_status?: number | null
  scrape_error?: string | null
  expires_at?: string
}

// ============================================
// DOMAIN TYPES — Email Contacts
// ============================================

export type EmailContact = {
  id: string
  email: string
  is_franchise_email: boolean
  franchise_lead_count: number
  primary_lead_id: string | null
  last_contacted_at: string | null
  contact_count: number
  is_blacklisted: boolean
  blacklist_reason: string | null
  is_generic: boolean
  email_domain: string | null
  created_at: string
}

export type EmailContactInsert = {
  id?: string
  email: string
  is_franchise_email?: boolean
  franchise_lead_count?: number
  primary_lead_id?: string | null
  last_contacted_at?: string | null
  contact_count?: number
  is_blacklisted?: boolean
  blacklist_reason?: string | null
  is_generic?: boolean
  email_domain?: string | null
}

// ============================================
// DOMAIN TYPES — Strip Templates
// ============================================

export type AccentFamily = 'warm' | 'red' | 'cool' | 'green' | 'pink' | 'purple' | 'neutral'

export type StripTemplate = {
  id: string
  industry: string
  industry_slug: string
  accent_family: AccentFamily
  image_url: string
  storage_path: string | null
  prompt_used: string | null
  created_at: string
}

export type StripTemplateInsert = {
  id?: string
  industry: string
  industry_slug: string
  accent_family: AccentFamily
  image_url: string
  storage_path?: string | null
  prompt_used?: string | null
}
export type TrackingEventType =
  | 'email_sent' | 'email_opened' | 'email_clicked'
  | 'page_visited' | 'page_visited_desktop' | 'page_visited_mobile'
  | 'sms_sent' | 'qr_scanned'
  | 'pass_downloaded' | 'pass_installed' | 'pass_removed'
  | 'reply_received' | 'followup_sent' | 'calendly_clicked'

// ============================================
// DISPLAY LABELS
// ============================================

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  unberuehrt: 'Unberührt',
  kontaktiert: 'Kontaktiert',
  geantwortet: 'Geantwortet',
  kunde: 'Kunde',
  blacklisted: 'Blacklisted',
}

export const BUNDESLAENDER = [
  'Baden-Württemberg',
  'Bayern',
  'Berlin',
  'Brandenburg',
  'Bremen',
  'Hamburg',
  'Hessen',
  'Mecklenburg-Vorpommern',
  'Niedersachsen',
  'Nordrhein-Westfalen',
  'Rheinland-Pfalz',
  'Saarland',
  'Sachsen',
  'Sachsen-Anhalt',
  'Schleswig-Holstein',
  'Thüringen',
] as const

export type Bundesland = (typeof BUNDESLAENDER)[number]
