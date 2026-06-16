import { z } from 'zod'

// JSON-only model-call helper for the incorporation engine (./incorporate.ts):
// run a gen, extract the first balanced JSON object from its output, validate it
// against a schema, and retry with the parse/validation error fed back.
//
// NOTE: the statement-ingest pipeline that also lived here (runDraftPipeline)
// was retired — statement drafting now runs on the editor's own statement agent
// in chat-do (recording draft_transaction), same mechanism as the live editor.
// This module is just the JSON-extraction helper now.

export type GenFn = (opts: {
  system: string
  prompt: string
  maxTokens: number
  images?: string[]
}) => Promise<string>

function firstJsonBlock(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let escNext = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escNext) {
      escNext = false
      continue
    }
    if (c === '\\') {
      escNext = inStr
      continue
    }
    if (c === '"') inStr = !inStr
    if (inStr) continue
    if (c === '{') depth++
    if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export async function genJson<T>(
  gen: GenFn,
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
  maxTokens: number,
  images?: string[],
  attempts = 3,
): Promise<{ value: T | null; error: string | null }> {
  let lastError = ''
  let p = prompt
  for (let i = 0; i < attempts; i++) {
    const text = await gen({ system, prompt: p, maxTokens, images })
    const block = firstJsonBlock(text)
    if (!block) {
      lastError = 'no JSON object in output'
    } else {
      try {
        const parsed = schema.safeParse(JSON.parse(block))
        if (parsed.success) return { value: parsed.data, error: null }
        lastError = parsed.error.issues
          .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
          .join('; ')
      } catch (e) {
        lastError = `invalid JSON: ${String(e)}`
      }
    }
    p = `${prompt}\n\nYour previous output was invalid (${lastError}). Output ONLY the corrected JSON object.`
  }
  return { value: null, error: lastError }
}
