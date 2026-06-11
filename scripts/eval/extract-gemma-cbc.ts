// "Compact Beancount" (CBC) for gemma-4, reasoning OFF. Decode is 96% of
// latency and ~linear in output tokens, so we squeeze the OUTPUT shape while
// keeping it Beancount-ish (not JSON/TOML — both measured *more* verbose):
//   - accounts referred to by DICT INDEX, not full path (kills the long
//     repeated "Expenses:Software:..." / card strings)
//   - TAB separators, no column alignment (gemma's space-padding was real tokens)
//   - currency INR implied; only foreign legs name a currency
//   - no narration
//   - merchant-side postings only; WE derive the card leg (-sum of INR weights)
// Runs N times to average out per-replica decode-throughput noise (58-90 tok/s),
// grades each run's debit total + forex legs against golden.beancount.
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/extract-gemma-cbc.ts [statement.txt] [runs]

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  buildStatementExtractionPrompt,
  buildExtractionContextBlock,
} from '../../src/durable/agent-prompt'

const MODEL = '@cf/google/gemma-4-26b-a4b-it'
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || 'e0bc1f55dc6fc3f8fe870087199a2ee3'
const CARD = 'Liabilities:CreditCards:Axis:MagnusBurgundy:3467'
const PRICE = { in: 0.1, out: 0.3 }
const here = path.dirname(new URL(import.meta.url).pathname)

// Same closed vocab as the dict-JSON experiment (1-based), with distractors.
const DICT = [
  'Expenses:Food:Restaurants',
  'Expenses:Food:Coffee',
  'Expenses:Food:Groceries',
  'Expenses:Food:Delivery',
  'Expenses:Shopping:Amazon',
  'Expenses:Shopping:Clothing',
  'Expenses:Shopping:Electronics',
  'Expenses:Shopping:General',
  'Expenses:Software:Hosting',
  'Expenses:Software:AI',
  'Expenses:Software:Subscription',
  'Expenses:Software:General',
  'Expenses:Health:Medical',
  'Expenses:Health:Fitness',
  'Expenses:Transport:Auto',
  'Expenses:Transport:Cab',
  'Expenses:Transport:Fuel',
  'Expenses:Entertainment:Streaming',
  'Expenses:Entertainment:Events',
  'Expenses:Utilities:Phone',
  'Expenses:Utilities:Internet',
  'Expenses:Travel:Hotel',
  'Expenses:Travel:Flights',
  'Expenses:Bank:ForexMarkup',
  'Expenses:Bank:Fees',
  'Expenses:Tax:GST',
  'Expenses:Misc',
]
const dictBlock = DICT.map((a, i) => `${i + 1}\t${a}`).join('\n')

const OUTPUT_FORMAT =
  `\n\n---\n\n# Output format (strict) — OVERRIDES any earlier instruction\n\n` +
  `Emit ONLY the compact ledger below, nothing else (no prose, no fences, no ` +
  `Beancount account names). Use the numbered account dictionary; refer to each ` +
  `account by its NUMBER. Pick the closest fit; use 27 only if nothing fits.\n\n` +
  `Account dictionary (number<TAB>account):\n${dictBlock}\n\n` +
  `One transaction = a header line at column 0 then TAB-indented posting lines:\n\n` +
  `\`\`\`\n` +
  `YYYY-MM-DD<TAB>PAYEE\n` +
  `<TAB>ACCTNUM<TAB>AMOUNT\n` +
  `\`\`\`\n\n` +
  `Rules (TAB = a single tab character, never spaces for separation):\n` +
  `- Header: date, one tab, payee text. No narration, no quotes.\n` +
  `- Each posting: a leading tab, the account NUMBER, a tab, the amount. ` +
  `Amounts are plain decimals (10155.00), INR is implied.\n` +
  `- List ONLY merchant-side postings. Do NOT emit the credit-card leg — it is ` +
  `derived as the negative sum of the INR weights.\n` +
  `- Foreign charge with an exchange rate: ` +
  `\`<TAB>ACCTNUM<TAB>9.28<TAB>USD<TAB>875.30\` — foreign amount, currency, then ` +
  `the INR printed on the statement verbatim.\n` +
  `- Foreign merchant billed directly in INR (DCC): just \`<TAB>ACCTNUM<TAB>AMOUNT\`.\n` +
  `- Forex markup (24) and its GST (26) are their OWN posting lines on the SAME ` +
  `transaction. Only add them when the statement shows a foreign-currency / ` +
  `markup fee row for that charge — NEVER invent markup on a domestic INR charge.\n` +
  `- Refund/credit: amount NEGATIVE; its own transaction.\n` +
  `- One blank line between transactions. Nothing to extract -> empty reply.`

type Posting = { idx: number; amount: number; currency: string; billedInr?: number }
type Txn = { date: string; payee: string; postings: Posting[] }

function todayInt(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}
async function loadSnapshot() {
  const p = path.join(here, 'snapshot.json')
  if (existsSync(p)) return JSON.parse(await readFile(p, 'utf8'))
  return { today: todayInt(), accounts: [] }
}

function resolveAccount(idx: number): string {
  return idx >= 1 && idx <= DICT.length ? DICT[idx - 1] : `Expenses:UNKNOWN:${idx}`
}

// Parse CBC. Header: starts with a date. Posting: indented, tab/space split.
function parseCbc(text: string): { txns: Txn[]; bad: number } {
  let bad = 0
  const txns: Txn[] = []
  let cur: Txn | null = null
  for (const raw of text.replace(/```\w*/g, '').split('\n')) {
    if (!raw.trim()) continue
    const head = raw.match(/^(\d{4}-\d{2}-\d{2})[\t ]+(.+?)\s*$/)
    if (head && !/^\s/.test(raw)) {
      cur = { date: head[1], payee: head[2].trim(), postings: [] }
      txns.push(cur)
      continue
    }
    if (!cur) continue
    // Indented posting: idx, amount, optional currency + billedInr.
    const cols = raw.trim().split(/[\t ]+/)
    if (cols.length < 2) continue
    const idx = parseInt(cols[0], 10)
    const amount = parseFloat(cols[1])
    if (!Number.isFinite(idx) || !Number.isFinite(amount)) continue
    if (idx < 1 || idx > DICT.length) bad++
    const p: Posting = { idx, amount, currency: 'INR' }
    if (cols[2] && /^[A-Z]{3}$/.test(cols[2])) {
      p.currency = cols[2]
      if (cols[3]) p.billedInr = parseFloat(cols[3])
    }
    cur.postings.push(p)
  }
  return { txns: txns.filter((t) => t.postings.length > 0), bad }
}

function weightInr(p: Posting): number {
  return p.currency !== 'INR' && p.billedInr != null ? p.billedInr : p.amount
}
function fmt(n: number): string {
  return n.toFixed(2)
}
function render(t: Txn): string {
  const lines = [`${t.date} * "${t.payee}"`]
  let card = 0
  for (const p of t.postings) {
    card += weightInr(p)
    const a = resolveAccount(p.idx)
    if (p.currency !== 'INR' && p.billedInr != null)
      lines.push(`  ${a.padEnd(48)} ${fmt(p.amount)} ${p.currency} @@ ${fmt(p.billedInr)} INR`)
    else lines.push(`  ${a.padEnd(48)} ${fmt(p.amount)} INR`)
  }
  lines.push(`  ${CARD.padEnd(48)} ${fmt(-card)} INR`)
  return lines.join('\n')
}

async function callModel(system: string, userMsg: string) {
  const t0 = Date.now()
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
        max_tokens: 32000,
        chat_template_kwargs: { enable_thinking: false },
      }),
    },
  )
  const ms = Date.now() - t0
  const json = (await res.json()) as {
    success?: boolean
    result?: {
      response?: string
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    errors?: unknown
  }
  if (!res.ok || json.success === false)
    throw new Error(`HTTP ${res.status} ${JSON.stringify(json.errors ?? json)}`)
  const raw =
    json.result?.response ?? json.result?.choices?.[0]?.message?.content ?? ''
  return { raw, ms, usage: json.result?.usage ?? null }
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error('Set CLOUDFLARE_API_TOKEN')
    process.exit(1)
  }
  const stmtPath = process.argv[2] || path.join(here, 'statement.txt')
  const runs = parseInt(process.argv[3] || '3', 10)
  const statementText = await readFile(stmtPath, 'utf8')
  const snapshot = await loadSnapshot()
  const filename = path.basename(stmtPath)
  const system = buildStatementExtractionPrompt() + OUTPUT_FORMAT
  const userMsg = `${buildExtractionContextBlock(snapshot, filename)}\n\n---\n\n${statementText}`

  const outDir = path.join(here, 'out')
  await mkdir(outDir, { recursive: true })

  for (let r = 1; r <= runs; r++) {
    const { raw, ms, usage } = await callModel(system, userMsg)
    const { txns, bad } = parseCbc(raw)
    const beancount = txns.map(render).join('\n\n')
    if (r === 1) {
      await writeFile(path.join(outDir, 'gemma-4.cbc.raw.txt'), raw.trim() + '\n')
      await writeFile(path.join(outDir, 'gemma-4.cbc.beancount'), beancount + '\n')
    }
    let debit = 0
    let credit = 0
    const seen = new Set<string>()
    let dups = 0
    for (const t of txns) {
      const w = t.postings.reduce((s, p) => s + weightInr(p), 0)
      if (w >= 0) debit += w
      else credit += -w
      const key = `${t.date}|${t.payee}|${fmt(w)}`
      if (seen.has(key)) dups++
      seen.add(key)
    }
    const pin = usage?.prompt_tokens ?? 0
    const pout = usage?.completion_tokens ?? 0
    const cost = (pin / 1e6) * PRICE.in + (pout / 1e6) * PRICE.out
    console.log(
      `run ${r}: ${ms}ms  in=${pin} out=${pout} cost=$${cost.toFixed(5)}  ` +
        `txns=${txns.length} debit=${fmt(debit)} credit=${fmt(credit)} ` +
        `dups=${dups} bad_idx=${bad}`,
    )
  }
  console.log(`\n-> scripts/eval/out/gemma-4.cbc.beancount (run 1 rendered)`)
}

main()
