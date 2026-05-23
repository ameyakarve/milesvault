import { compile } from 'vega-lite'
import type { TopLevelSpec } from 'vega-lite'

export type VegaValidation =
  | { ok: true }
  | { ok: false; error: string; hint?: string }

const MAX_ERR_LENGTH = 1200
const RENDERABLE_KEYS = ['mark', 'layer', 'hconcat', 'vconcat', 'concat', 'facet', 'repeat'] as const

export function validateVegaSpec(spec: unknown): VegaValidation {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, error: 'spec must be a JSON object.' }
  }
  const s = spec as Record<string, unknown>

  if (!RENDERABLE_KEYS.some((k) => k in s)) {
    return {
      ok: false,
      error: `spec must include one of: ${RENDERABLE_KEYS.join(', ')}.`,
      hint: 'For a single chart, set "mark" (e.g. "bar", "line", "rect"). Use "layer" for overlays.',
    }
  }

  if ('mark' in s) {
    const data = s.data as { values?: unknown } | undefined
    if (!data || !Array.isArray(data.values) || data.values.length === 0) {
      return {
        ok: false,
        error: 'spec.data.values must be a non-empty array.',
        hint: 'Embed rows directly: data: { values: [{ ... }, { ... }] }. Remote URLs are not supported.',
      }
    }

    const enc = s.encoding as Record<string, unknown> | undefined
    if (enc && typeof enc === 'object') {
      const first = data.values[0] as Record<string, unknown> | undefined
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const keys = new Set(Object.keys(first))
        const missing: string[] = []
        for (const [channel, defRaw] of Object.entries(enc)) {
          const def = defRaw as { field?: unknown } | null
          if (def && typeof def === 'object' && typeof def.field === 'string') {
            if (!keys.has(def.field)) missing.push(`${channel}.field "${def.field}"`)
          }
        }
        if (missing.length > 0) {
          return {
            ok: false,
            error: `encoding fields not present in data.values: ${missing.join(', ')}.`,
            hint: `Available fields in data.values[0]: ${[...keys].join(', ')}. Either correct the field names or update data.values to include them.`,
          }
        }
      }
    }
  }

  try {
    compile(s as unknown as TopLevelSpec)
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: trim(e instanceof Error ? e.message : String(e)),
      hint: 'Fix the schema error and do not regenerate the same JSON.',
    }
  }
}

function trim(s: string): string {
  if (s.length <= MAX_ERR_LENGTH) return s
  return s.slice(0, MAX_ERR_LENGTH) + ' …[trimmed]'
}
