import { parseBuffer } from '@/lib/beancount/parse'
import { coreValidators, type ValidateContext } from '@/lib/beancount/validators'

export type BufferState =
  | { kind: 'clean' }
  | { kind: 'pending' }
  | { kind: 'dirty' }
  | { kind: 'staged'; validated: boolean }

export function evaluateBuffer(buffer: string, baseline: string): BufferState {
  if (buffer === baseline) return { kind: 'clean' }
  const { entries, diagnostics } = parseBuffer(buffer)
  if (diagnostics.length > 0) return { kind: 'dirty' }
  const ctx: ValidateContext = { parsed: entries, doc: buffer }
  for (const v of coreValidators) {
    try {
      if (v(ctx).length > 0) return { kind: 'staged', validated: false }
    } catch {
      return { kind: 'staged', validated: false }
    }
  }
  return { kind: 'staged', validated: true }
}
