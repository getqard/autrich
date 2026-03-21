/**
 * Pipeline Step Definitions
 *
 * Each step in the enrichment pipeline is defined here.
 * Steps marked 'available' can be executed. Steps marked 'not_built'
 * show a "Coming Soon" placeholder in the UI.
 *
 * When building a new phase, just change status to 'available'.
 */

export type PipelineStepStatus = 'available' | 'not_built'

export type PipelineStepDefinition = {
  id: string
  name: string
  description: string
  phase: number | string
  status: PipelineStepStatus
  /** API endpoint to call for this step */
  endpoint: string | null
  /** Which fields from the previous step this step needs */
  dependsOn: string[]
}

export const PIPELINE_STEPS: PipelineStepDefinition[] = [
  {
    id: 'scrape',
    name: 'Website Scrape',
    description: 'Scrapt die Website nach Logo, Farben, Meta-Daten und Social Links',
    phase: 3,
    status: 'available',
    endpoint: '/api/pipeline/run-step',
    dependsOn: [],
  },
  {
    id: 'logo',
    name: 'Logo Extraktion',
    description: 'Wählt das beste Logo aus allen Kandidaten (AI Picker oder Score)',
    phase: 3,
    status: 'available',
    endpoint: '/api/pipeline/run-step',
    dependsOn: ['scrape'],
  },
  {
    id: 'colors',
    name: 'Farb-Bestimmung',
    description: 'Bestimmt Pass-Farben via AI Vision oder Waterfall-Logik',
    phase: 3,
    status: 'available',
    endpoint: '/api/pipeline/run-step',
    dependsOn: ['scrape', 'logo'],
  },
  {
    id: 'classify',
    name: 'AI Klassifizierung',
    description: 'Erkennt Branche, generiert Reward, Hooks und Personalisierung',
    phase: 3,
    status: 'available',
    endpoint: '/api/pipeline/run-step',
    dependsOn: ['scrape'],
  },
  {
    id: 'strip',
    name: 'Strip Image',
    description: 'Wählt passendes Strip-Template oder generiert via AI',
    phase: 4,
    status: 'available',
    endpoint: '/api/pipeline/run-step',
    dependsOn: ['classify', 'colors'],
  },
  {
    id: 'pass',
    name: 'Pass Generation',
    description: 'Generiert Apple .pkpass + Google Wallet Save URL',
    phase: 5,
    status: 'not_built',
    endpoint: null,
    dependsOn: ['logo', 'colors', 'strip'],
  },
  {
    id: 'preview',
    name: 'iPhone Preview',
    description: 'Generiert iPhone Mockup PNG mit dem fertigen Pass',
    phase: 7,
    status: 'not_built',
    endpoint: null,
    dependsOn: ['pass'],
  },
  {
    id: 'email',
    name: 'Email Generation',
    description: 'Schreibt personalisierte Cold Email mit AI',
    phase: 8,
    status: 'not_built',
    endpoint: null,
    dependsOn: ['classify', 'preview'],
  },
]

/**
 * Get all steps up to and including the first not_built step.
 */
export function getAvailableSteps(): PipelineStepDefinition[] {
  const available: PipelineStepDefinition[] = []
  for (const step of PIPELINE_STEPS) {
    available.push(step)
    if (step.status === 'not_built') break
  }
  return available
}

/**
 * Get only the runnable steps.
 */
export function getRunnableSteps(): PipelineStepDefinition[] {
  return PIPELINE_STEPS.filter(s => s.status === 'available')
}
