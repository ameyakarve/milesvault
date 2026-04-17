import type { Transaction as BeanTxn } from 'beancount'
import { parse } from 'beancount'

export type ParsedTxn = {
  bean: BeanTxn
  raw: string
}

export type CardPattern = {
  name: string
  tryRender: (parsed: ParsedTxn) => React.JSX.Element | null
}

export function safeParse(raw: string): ParsedTxn | null {
  try {
    const result = parse(raw)
    const bean = result.transactions[0]
    if (!bean) return null
    return { bean, raw }
  } catch {
    return null
  }
}
