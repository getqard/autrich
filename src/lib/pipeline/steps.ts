/**
 * Pipeline Step Definitions — URL-basierte Tool-Pipeline
 *
 * Diese Liste beschreibt die URL-basierten Enrichment-Schritte, die im
 * Dev-Tool unter `/tools/pipeline` Schritt für Schritt ausgeführt werden.
 * Aufruf-Endpoint: POST /api/pipeline/run-step.
 *
 * Lead-basierte Schritte (pass, mockup, email) werden NICHT hier gelistet —
 * die brauchen einen DB-Lead und laufen über `lib/pipeline/run-single-lead.ts`
 * (Phase A: enrichment, Phase B: pass/email/mockup).
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
]

export function getRunnableSteps(): PipelineStepDefinition[] {
  return PIPELINE_STEPS.filter((s) => s.status === 'available')
}
