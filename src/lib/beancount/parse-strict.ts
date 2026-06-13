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
    // The underlying parser throws on a hard syntax error and the thrown
    // message already names the offending line (e.g. "Could not parse posting:
    // Assets:Foo Bar  10 USD"). Surface it verbatim — far more actionable than
    // a bare "parse error" the model can't trace back to a line.
    const detail = e instanceof Error && e.message ? e.message : 'unparseable text'
    return {
      ok: false,
      kind: 'parse_error',
      message: `could not parse — ${detail}`,
    }
  }
  if (parsed.unsupportedDirectiveTypes.length > 0) {
    return {
      ok: false,
      kind: 'unsupported_directives',
      message: `could not parse — unsupported directive(s): ${parsed.unsupportedDirectiveTypes.join(', ')}`,
    }
  }
  if (parsed.partialParse) {
    // Whole directives that the parser couldn't read are dropped silently; name
    // the lines it skipped so the model can fix the right entry.
    const lines = text.split('\n')
    const dropped = parsed.droppedLineNumbers
      .map((n) => lines[n - 1]?.trim())
      .filter((l): l is string => Boolean(l))
    const detail = dropped.length ? `: ${dropped.join(' / ')}` : ''
    return {
      ok: false,
      kind: 'partial_parse',
      message: `could not parse line(s)${detail}`,
    }
  }
  return {
    ok: true,
    transactions: parsed.transactions,
    directives: parsed.directives,
    entries: parsed.entries,
  }
}
