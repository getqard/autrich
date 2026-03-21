/**
 * Gemini Flash Client — Lightweight wrapper around the Gemini REST API.
 *
 * Used for: Classification, Logo Picking, Color Picking
 * NOT used for: Email Writing (stays on Claude Haiku for natural German text)
 *
 * Cost: ~$0.10/MTok input, $0.40/MTok output (10x cheaper than Haiku)
 */

const GEMINI_MODEL = 'gemini-2.0-flash'

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }

type GeminiContent = {
  role?: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiResponse = {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>
    }
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

export type GeminiResult = {
  text: string
  tokensIn: number
  tokensOut: number
  costUsd: number
}

/**
 * Call Gemini Flash with text-only input.
 */
export async function geminiText(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const response = await callGemini(apiKey, {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: {
      maxOutputTokens: options?.maxTokens || 1024,
      temperature: options?.temperature ?? 0.7,
    },
  })

  return parseResponse(response)
}

/**
 * Call Gemini Flash with vision input (images + text).
 */
export async function geminiVision(
  images: Array<{ buffer: Buffer; mimeType?: string }>,
  prompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const parts: GeminiPart[] = []

  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType || 'image/png',
        data: img.buffer.toString('base64'),
      },
    })
  }

  parts.push({ text: prompt })

  const response = await callGemini(apiKey, {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: options?.maxTokens || 256,
      temperature: options?.temperature ?? 0.3,
    },
  })

  return parseResponse(response)
}

/**
 * Call Gemini Flash with labeled images (interleaved text + images).
 */
export async function geminiLabeledVision(
  labeledImages: Array<{ label: string; buffer: Buffer; mimeType?: string }>,
  finalPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const parts: GeminiPart[] = []

  for (const img of labeledImages) {
    parts.push({ text: img.label })
    parts.push({
      inlineData: {
        mimeType: img.mimeType || 'image/png',
        data: img.buffer.toString('base64'),
      },
    })
  }

  parts.push({ text: finalPrompt })

  const response = await callGemini(apiKey, {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: options?.maxTokens || 100,
      temperature: options?.temperature ?? 0.2,
    },
  })

  return parseResponse(response)
}

// ─── Internal ────────────────────────────────────────────────

async function callGemini(apiKey: string, body: Record<string, unknown>): Promise<GeminiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${errorText.substring(0, 200)}`)
  }

  return res.json()
}

function parseResponse(response: GeminiResponse): GeminiResult {
  const text = response.candidates?.[0]?.content?.parts
    ?.map(p => p.text)
    .join('') || ''

  const tokensIn = response.usageMetadata?.promptTokenCount || 0
  const tokensOut = response.usageMetadata?.candidatesTokenCount || 0
  // Gemini 2.0 Flash: $0.10/MTok input, $0.40/MTok output
  const costUsd = (tokensIn * 0.10 + tokensOut * 0.40) / 1_000_000

  return { text, tokensIn, tokensOut, costUsd }
}

/**
 * Extract JSON from a response that might have markdown fences or extra text.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim()
  // Try markdown code fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()
  // Try raw JSON object
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (jsonMatch) return jsonMatch[0]
  return trimmed
}
