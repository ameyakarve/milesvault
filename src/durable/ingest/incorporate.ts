import { z } from 'zod'
import { isStrictParseErr, parseJournalStrict } from '@/lib/beancount/parse-strict'
import { serializeJournal } from '@/lib/beancount/ast'
import { genJson, type GenFn } from './pipeline'

// One workflow for add / edit / delete (and, later, statements): turn a user's
// intent into a set of dated changes by date-bucketed incorporation —
//   1. plan: which dates does the intent touch?
//   2. incorporate (parallel per date): rewrite that day's full entry set
//   3. diff: old bucket vs new bucket -> ops (delete olds gone, add news)
// The model never sees ids or writes SQL; each shard gets a small, COMPLETE
// picture (one date) and rewrites it. Output is the { id, text?, replaces? }
// shape the draft card + commitDraftOps already take (an edit = delete-old +
// add-new — no fragile pairing). Model calls are injected so it's shareable
// across DOs, like runDraftPipeline.

const ZDates = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(120),
})
const ZEntries = z.object({ entries: z.array(z.string()).max(50) })

export type IncorporationOp = { id: string; text?: string; replaces?: string }

// Stable form for comparing "is this entry unchanged" across the old/new
// buckets — parse + reserialize so whitespace/alignment differences don't read
// as a change. `replaces`/`text` carry the VERBATIM text, not the canonical one.
function canon(text: string): string {
  const p = parseJournalStrict(text)
  if (isStrictParseErr(p)) return text.trim()
  return serializeJournal(p.transactions, p.directives, { descending: false }).trim()
}

export async function runIncorporation(deps: {
  gen: GenFn
  intent: string
  today: string // YYYY-MM-DD
  accounts: readonly string[]
  cardContext?: string | null
  readDates: (dates: string[]) => Promise<Record<string, string[]>>
}): Promise<{ ops: IncorporationOp[]; dates: string[]; error: string | null }> {
  // 1. Plan — which dates does the request touch?
  const planSystem = `You schedule ledger changes by date. Read the user's request and list every date (YYYY-MM-DD) whose entries it adds, edits, or removes. Today is ${deps.today}; resolve relative dates ("yesterday", "last month") against it. Output ONLY JSON: {"dates":["YYYY-MM-DD", ...]} — empty if no specific date is implied.`
  const plan = await genJson(deps.gen, ZDates, planSystem, deps.intent, 256)
  const dates = [...new Set(plan.value?.dates ?? [])]
  if (dates.length === 0) return { ops: [], dates: [], error: plan.error }

  const existing = await deps.readDates(dates)
  const acct = deps.accounts.join('\n')

  // 2. Incorporate each date in parallel — rewrite the day's full bucket.
  const perDate = await Promise.all(
    dates.map(async (date) => {
      const old = existing[date] ?? []
      const system = `You revise ONE day of a beancount ledger. Given that day's EXISTING entries and the user's request, return the COMPLETE set of entries the day should have AFTERWARD: copy unchanged entries VERBATIM, modify only what the request changes, drop entries it removes, add entries it introduces. Each entry is one transaction, or a balance/pad assertion. Output ONLY JSON: {"entries":["<full beancount entry text>", ...]} (empty array if the day should end with no entries).${
        deps.cardContext ? `\n\n${deps.cardContext}` : ''
      }\n\nOpen accounts:\n${acct}`
      const prompt = `Date: ${date}\nUser request: ${deps.intent}\n\nExisting entries on ${date}:\n${
        old.length ? old.join('\n\n') : '(none)'
      }`
      const res = await genJson(deps.gen, ZEntries, system, prompt, 2048)
      return { old, next: res.value?.entries ?? [] }
    }),
  )

  // 3. Diff per date -> ops. Compare on canonical form; carry verbatim text.
  const ops: IncorporationOp[] = []
  let n = 0
  for (const { old, next } of perDate) {
    const oldByCanon = new Map(old.map((t) => [canon(t), t]))
    const nextByCanon = new Map(next.map((t) => [canon(t), t]))
    for (const [c, oldT] of oldByCanon) {
      if (!nextByCanon.has(c)) ops.push({ id: `op${++n}`, replaces: oldT })
    }
    for (const [c, newT] of nextByCanon) {
      if (!oldByCanon.has(c)) ops.push({ id: `op${++n}`, text: newT })
    }
  }
  return { ops, dates, error: null }
}
