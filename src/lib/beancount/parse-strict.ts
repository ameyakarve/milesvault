import type { DirectiveInput, TransactionInput } from '@/durable/ledger-types'
import { parseJournal } from './ast'

export type StrictParseOk = {
  ok: true
  transactions: TransactionInput[]
  directives: DirectiveInput[]
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
      message: e instanceof Error ? e.message : String(e),
    }
  }
  if (parsed.unsupportedDirectiveTypes.length > 0) {
    return {
      ok: false,
      kind: 'unsupported_directives',
      message: `Unsupported directive types: ${parsed.unsupportedDirectiveTypes.join(', ')}`,
    }
  }
  if (parsed.partialParse) {
    const dropped = parsed.droppedLineNumbers.join(', ')
    return {
      ok: false,
      kind: 'partial_parse',
      message:
        `Input had ${parsed.expectedDirectiveLineCount} dated line(s) but only ` +
        `${parsed.parsedDirectiveCount} parsed. Likely dropped line(s): ${dropped}. ` +
        `Top-level directives must start at column 0 (no leading whitespace).`,
    }
  }
  return { ok: true, transactions: parsed.transactions, directives: parsed.directives }
}
