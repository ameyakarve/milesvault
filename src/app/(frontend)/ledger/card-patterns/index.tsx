import { complexPattern } from './complex'
import { expensePattern } from './expense'
import { RawCard } from './raw'
import { safeParse, type CardPattern } from './types'

const PATTERNS: CardPattern[] = [expensePattern, complexPattern]

export function TxnCard({ raw }: { raw: string }) {
  const parsed = safeParse(raw)
  if (!parsed) return <RawCard text={raw} />
  for (const p of PATTERNS) {
    const element = p.tryRender(parsed)
    if (element) return element
  }
  return <RawCard text={raw} />
}
