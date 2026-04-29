import type { DirectiveInput, TransactionInput } from '@/durable/ledger-types'
import { parseJournal, type ParsedEntry } from './ast'

export type StrictParseOk = {
  ok: true
  transactions: TransactionInput[]
  directives: DirectiveInput[]
  entries: ParsedEntry[]
}

export type StrictParseErr = {
  ok: false
  kind: 'parse_error' | 'partial_parse' | 'unsupported_directives'
  message: string
}

export type StrictParseResult = StrictParseOk | StrictParseErr

export function isStrictParseErr(r: StrictParseResult): r is StrictParseErr {
  return r.ok === false
}

export function parseJournalStrict(text: string): StrictParseResult {
  let parsed
  try {
    parsed = parseJournal(text)
  } catch (e) {
    return {
      ok: false,
      kind: 'parse_error',
      message: 'parse error',
    }
  }
  if (parsed.unsupportedDirectiveTypes.length > 0) {
    return { ok: false, kind: 'unsupported_directives', message: 'parse error' }
  }
  if (parsed.partialParse) {
    return { ok: false, kind: 'partial_parse', message: 'parse error' }
  }
  for (const tx of parsed.transactions) {
    for (const p of tx.postings) {
      if (p.amount == null || p.amount === '' || p.currency == null || p.currency === '') {
        return {
          ok: false,
          kind: 'parse_error',
          message: 'every posting must have an explicit amount and currency',
        }
      }
    }
  }
  return {
    ok: true,
    transactions: parsed.transactions,
    directives: parsed.directives,
    entries: parsed.entries,
  }
}
