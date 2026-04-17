import { complexPattern } from './complex'
import { RawCard } from './raw'
import { simpleCashbackPattern } from './simple-cashback'
import { simpleExpensePattern } from './simple-expense'
import { safeParse, type CardPattern } from './types'

const PATTERNS: CardPattern[] = [simpleExpensePattern, simpleCashbackPattern, complexPattern]

export function TxnCard({ raw }: { raw: string }) {
  const parsed = safeParse(raw)
  if (!parsed) return <RawCard text={raw} />
  for (const p of PATTERNS) {
    const element = p.tryRender(parsed)
    if (element) return element
  }
  return <RawCard text={raw} />
}
