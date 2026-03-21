'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronUp, Play, RotateCcw, Copy,
  Globe, Image, Palette, Brain, Layers, Lock,
} from 'lucide-react'
import { PIPELINE_STEPS } from '@/lib/pipeline/steps'
import type { PipelineStepDefinition } from '@/lib/pipeline/steps'

type StepResult = {
  step: string
  success: boolean
  cacheHit?: boolean
  cachedAt?: string
  durationMs: number
  data: Record<string, unknown>
  error?: string
}

type StepState = 'idle' | 'running' | 'done' | 'error' | 'not_built'

const STEP_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  scrape: Globe,
  logo: Image,
  colors: Palette,
  classify: Brain,
  strip: Layers,
}

export default function PipelinePage() {
  const [url, setUrl] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({})
  const [stepResults, setStepResults] = useState<Record<string, StepResult>>({})
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [context, setContext] = useState<Record<string, unknown>>({})

  function toggleExpand(stepId: string) {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }

  async function runStep(step: PipelineStepDefinition, currentContext: Record<string, unknown>) {
    setStepStates(prev => ({ ...prev, [step.id]: 'running' }))

    try {
      const res = await fetch('/api/pipeline/run-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: step.id,
          url: url.trim(),
          context: currentContext,
          force: false,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setStepStates(prev => ({ ...prev, [step.id]: 'error' }))
        setStepResults(prev => ({ ...prev, [step.id]: { step: step.id, success: false, durationMs: 0, data: {}, error: result.error } }))
        return null
      }

      setStepStates(prev => ({ ...prev, [step.id]: 'done' }))
      setStepResults(prev => ({ ...prev, [step.id]: result }))
      setExpandedSteps(prev => new Set([...prev, step.id]))
      return result
    } catch (err) {
      setStepStates(prev => ({ ...prev, [step.id]: 'error' }))
      setStepResults(prev => ({
        ...prev,
        [step.id]: { step: step.id, success: false, durationMs: 0, data: {}, error: 'Netzwerkfehler' },
      }))
      return null
    }
  }

  async function runAll() {
    if (!url.trim()) return
    setRunning(true)
    setStepStates({})
    setStepResults({})
    setExpandedSteps(new Set())
    setContext({})

    let currentContext: Record<string, unknown> = {
      businessName: businessName.trim() || undefined,
    }

    for (const step of PIPELINE_STEPS) {
      if (step.status === 'not_built') {
        setStepStates(prev => ({ ...prev, [step.id]: 'not_built' }))
        break
      }

      const result = await runStep(step, currentContext)
      if (!result || !result.success) break

      // Build context for next step
      if (step.id === 'scrape') {
        currentContext = {
          ...currentContext,
          scrapeData: result.data,
        }
      } else if (step.id === 'logo') {
        currentContext = {
          ...currentContext,
          logoBase64: result.data?.base64,
          logoSource: result.data?.source,
        }
      } else if (step.id === 'colors') {
        currentContext = {
          ...currentContext,
          backgroundColor: result.data?.backgroundColor,
          textColor: result.data?.textColor,
          labelColor: result.data?.labelColor,
        }
      } else if (step.id === 'classify') {
        currentContext = {
          ...currentContext,
          industrySlug: result.data?.industry,
          classifyData: result.data,
        }
      }
    }

    setContext(currentContext)
    setRunning(false)
  }

  async function rerunStep(step: PipelineStepDefinition) {
    setRunning(true)
    await runStep(step, context)
    setRunning(false)
  }

  function copyResult() {
    const allResults = Object.values(stepResults)
    navigator.clipboard.writeText(JSON.stringify(allResults, null, 2))
  }

  return (
    <div>
      <Link
        href="/tools"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Zurück zu Tools
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-zinc-800 rounded-lg">
          <Play size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Pipeline Test Runner</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        URL eingeben &rarr; Schritt für Schritt durch die gesamte Enrichment-Pipeline
      </p>

      {/* Input */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-zinc-300 mb-2">Website URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://doener-palace.de"
              onKeyDown={(e) => e.key === 'Enter' && runAll()}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Business Name (optional)</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Döner Palace"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
        </div>
        <button
          onClick={runAll}
          disabled={running || !url.trim()}
          className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          Pipeline starten
        </button>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {PIPELINE_STEPS.map((step, i) => {
          const state = stepStates[step.id] || (step.status === 'not_built' ? 'not_built' : 'idle')
          const result = stepResults[step.id]
          const expanded = expandedSteps.has(step.id)
          const Icon = STEP_ICONS[step.id] || Globe

          return (
            <div key={step.id}>
              {/* Connector */}
              {i > 0 && (
                <div className="flex justify-center py-1">
                  <div className="w-px h-4 bg-zinc-800" />
                </div>
              )}

              <div className={`border rounded-xl transition-colors ${
                state === 'done' ? 'bg-zinc-900 border-green-500/20' :
                state === 'error' ? 'bg-zinc-900 border-red-500/20' :
                state === 'running' ? 'bg-zinc-900 border-amber-500/20' :
                state === 'not_built' ? 'bg-zinc-950 border-zinc-800/50' :
                'bg-zinc-900 border-zinc-800'
              }`}>
                {/* Step Header */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer"
                  onClick={() => result && toggleExpand(step.id)}
                >
                  {/* Status Icon */}
                  <div className={`p-2 rounded-lg ${
                    state === 'done' ? 'bg-green-500/10' :
                    state === 'error' ? 'bg-red-500/10' :
                    state === 'running' ? 'bg-amber-500/10' :
                    state === 'not_built' ? 'bg-zinc-800/50' :
                    'bg-zinc-800'
                  }`}>
                    {state === 'running' ? (
                      <Loader2 size={16} className="animate-spin text-amber-400" />
                    ) : state === 'done' ? (
                      <CheckCircle size={16} className="text-green-400" />
                    ) : state === 'error' ? (
                      <XCircle size={16} className="text-red-400" />
                    ) : state === 'not_built' ? (
                      <Lock size={16} className="text-zinc-600" />
                    ) : (
                      <Icon size={16} className="text-zinc-500" />
                    )}
                  </div>

                  {/* Step Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${state === 'not_built' ? 'text-zinc-600' : 'text-zinc-200'}`}>
                        Step {i + 1}: {step.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                        P{step.phase}
                      </span>
                      {result?.cacheHit && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                          CACHE
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 ${state === 'not_built' ? 'text-zinc-700' : 'text-zinc-500'}`}>
                      {state === 'not_built' ? `Phase ${step.phase} — noch nicht gebaut` : step.description}
                    </p>
                  </div>

                  {/* Duration + Expand */}
                  <div className="flex items-center gap-3">
                    {result?.durationMs !== undefined && (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Clock size={12} />
                        {(result.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                    {result && (
                      expanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />
                    )}
                  </div>
                </div>

                {/* Step Detail (expanded) */}
                {expanded && result && (
                  <div className="border-t border-zinc-800 p-4">
                    {result.error ? (
                      <p className="text-sm text-red-400">{result.error}</p>
                    ) : (
                      <StepDetail stepId={step.id} data={result.data} />
                    )}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => rerunStep(step)}
                        disabled={running}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg text-xs hover:bg-zinc-700 disabled:opacity-50"
                      >
                        <RotateCcw size={12} /> Wiederholen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      {Object.keys(stepResults).length > 0 && (
        <div className="flex gap-3 mt-6">
          <button
            onClick={copyResult}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700"
          >
            <Copy size={14} /> Ergebnis kopieren
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Step Detail Renderers ──────────────────────────────────────

function StepDetail({ stepId, data }: { stepId: string; data: Record<string, unknown> }) {
  switch (stepId) {
    case 'scrape':
      return <ScrapeDetail data={data} />
    case 'logo':
      return <LogoDetail data={data} />
    case 'colors':
      return <ColorsDetail data={data} />
    case 'classify':
      return <ClassifyDetail data={data} />
    case 'strip':
      return <StripDetail data={data} />
    default:
      return <pre className="text-xs text-zinc-400 overflow-auto">{JSON.stringify(data, null, 2)}</pre>
  }
}

function ScrapeDetail({ data }: { data: Record<string, unknown> }) {
  const logoCandidates = data.logoCandidates as Array<{ url: string; source: string; score: number }> | undefined
  const socialLinks = data.socialLinks as Record<string, string> | undefined

  return (
    <div className="space-y-2">
      <DetailRow label="Title" value={data.title as string || '—'} />
      <DetailRow label="Logo Kandidaten" value={`${logoCandidates?.length || 0}`} />
      {socialLinks && Object.keys(socialLinks).length > 0 && (
        <DetailRow label="Social" value={Object.entries(socialLinks).map(([k, v]) => `${k}: ${v}`).join(', ')} />
      )}
      <DetailRow label="Loyalty" value={data.loyaltyDetected ? 'Ja' : 'Nein'} />
      <DetailRow label="App" value={data.appDetected ? 'Ja' : 'Nein'} />
      <DetailRow label="Typ" value={data.websiteType as string || 'website'} />
    </div>
  )
}

function LogoDetail({ data }: { data: Record<string, unknown> }) {
  const base64 = data.base64 as string | undefined
  const source = data.source as string | undefined
  const sizeBytes = data.sizeBytes as number | undefined

  return (
    <div className="flex items-center gap-4">
      {base64 && (
        <div className="w-16 h-16 bg-zinc-800 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${base64}`}
            alt="Logo"
            className="w-full h-full object-contain"
          />
        </div>
      )}
      <div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          source === 'website' ? 'bg-green-500/10 text-green-400' :
          source === 'instagram' ? 'bg-purple-500/10 text-purple-400' :
          source === 'favicon' ? 'bg-zinc-700 text-zinc-400' :
          'bg-red-500/10 text-red-400'
        }`}>
          {source || 'unknown'}
        </span>
        {sizeBytes !== undefined && (
          <p className="text-[10px] text-zinc-600 mt-1">{(sizeBytes / 1024).toFixed(0)} KB</p>
        )}
      </div>
    </div>
  )
}

function ColorsDetail({ data }: { data: Record<string, unknown> }) {
  const bg = data.backgroundColor as string | undefined
  const text = data.textColor as string | undefined
  const label = data.labelColor as string | undefined
  const method = data.method as string | undefined

  const colors = [
    { key: 'BG', color: bg },
    { key: 'Label', color: label },
    { key: 'Text', color: text },
  ].filter(c => c.color)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {colors.map(({ key, color }) => (
          <div key={key} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg border border-zinc-600" style={{ backgroundColor: color }} />
            <div>
              <p className="text-xs font-mono text-zinc-200">{color}</p>
              <p className="text-[10px] text-zinc-600">{key}</p>
            </div>
          </div>
        ))}
      </div>
      {method && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
          {method}
        </span>
      )}
      {bg && (
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-700"
          style={{ backgroundColor: bg }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: text || '#fff' }}>Treuekarte</p>
            <p className="text-[10px]" style={{ color: label || '#bbb' }}>10 Stempel</p>
          </div>
        </div>
      )}
    </div>
  )
}

function ClassifyDetail({ data }: { data: Record<string, unknown> }) {
  const industry = data.industry as string || ''
  const method = data.method as string || ''
  const emoji = data.detected_reward_emoji as string || ''
  const reward = data.detected_reward as string || '—'
  const passTitle = data.detected_pass_title as string || '—'
  const maxStamps = data.detected_max_stamps as number || 10
  const hooks = data.email_hooks as string[] | undefined

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">{emoji} {industry}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          method === 'gmaps' ? 'bg-blue-500/10 text-blue-400' :
          method === 'ai' ? 'bg-purple-500/10 text-purple-400' :
          'bg-amber-500/10 text-amber-400'
        }`}>
          {method}
        </span>
      </div>
      <DetailRow label="Reward" value={`${reward} ${emoji}`} />
      <DetailRow label="Pass Titel" value={passTitle} />
      <DetailRow label="Stempel" value={`${maxStamps}`} />
      {hooks && hooks.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-600 mb-1">Email Hooks:</p>
          {hooks.map((hook, i) => (
            <p key={i} className="text-xs text-zinc-400 py-0.5">· {hook}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function StripDetail({ data }: { data: Record<string, unknown> }) {
  const source = data.source as string || ''
  const variant = data.variant as string || ''
  const distance = data.distance as number | undefined
  const imageUrl = data.imageUrl as string | undefined
  const base64 = data.base64 as string | undefined

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          source === 'template' ? 'bg-green-500/10 text-green-400' : 'bg-purple-500/10 text-purple-400'
        }`}>
          {source}
        </span>
        <span className="text-xs text-zinc-400">Variante: {variant}</span>
        {distance !== undefined && (
          <span className="text-[10px] text-zinc-600">Distance: {distance}</span>
        )}
      </div>
      {imageUrl && (
        <div className="rounded-lg overflow-hidden border border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Strip"
            className="w-full h-auto"
          />
        </div>
      )}
      {base64 && (
        <div className="rounded-lg overflow-hidden border border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${base64}`}
            alt="Strip (AI)"
            className="w-full h-auto"
          />
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-300">{value}</span>
    </div>
  )
}
