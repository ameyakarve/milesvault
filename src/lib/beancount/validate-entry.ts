import { parseBuffer } from './parse'
import { coreValidators } from './validators'

export type ValidationError = {
  source: string
  message: string
}

export type ValidationResult = {
  ok: boolean
  errors: ValidationError[]
}

/**
 * Run the full parse + coreValidators pipeline on a single raw entry string.
 * Returns structured errors agents can read. `ok: true` means no parse diagnostics
 * and no validator errors.
 */
export function validateEntry(raw_text: string): ValidationResult {
  const errors: ValidationError[] = []
  const parsed = parseBuffer(raw_text)
  for (const d of parsed.diagnostics) {
    errors.push({ source: 'parse', message: d.message })
  }
  const ctx = { parsed: parsed.entries, doc: raw_text }
  for (const v of coreValidators) {
    for (const diag of v(ctx)) {
      if (diag.severity !== 'error') continue
      errors.push({ source: diag.source ?? 'validator', message: diag.message })
    }
  }
  return { ok: errors.length === 0, errors }
}
