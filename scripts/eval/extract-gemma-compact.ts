// Gemma-4, reasoning OFF, output-token-minimized. Decode is 96% of gemma's
// latency, so the only lever is emitting fewer tokens. Two cuts vs
// extract-gemma-nothink.ts, both in the SAME raw-Beancount shape gemma already
// reads forex correctly in (low correctness risk):
//   1. merchant-side postings only — WE derive the card leg (-sum of INR weights)
//   2. no narration string on the header
// We re-render the full balanced Beancount afterwards. Measures latency + tokens
// and lets us eyeball whether the forex pairing survives the leaner format.
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/extract-gemma-compact.ts [statement.txt]

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

const OUTPUT_FORMAT =
  `\n\n---\n\n# Output format (strict) — OVERRIDES any earlier instruction\n\n` +
  `Emit raw Beancount, nothing else (no prose, no fences). Rules:\n\n` +
  `- One entry per transaction. Header line at column 0: ` +
  `\`YYYY-MM-DD * "PAYEE"\` — payee only, NO narration string after it.\n` +
  `- List ONLY merchant-side postings (expense/income legs), indented. Do NOT ` +
  `emit the credit-card liability leg — it is derived automatically as the ` +
  `negative sum of the INR weights. Never output a ` +
  `\`Liabilities:CreditCards:...\` posting.\n` +
  `- Domestic INR charge: one posting, \`Account  123.45 INR\`.\n` +
  `- Foreign charge with an exchange rate: \`Account  9.28 USD @@ 875.30 INR\` ` +
  `(the INR printed on the statement, verbatim).\n` +
  `- Foreign merchant billed directly in INR (DCC): plain INR posting, no @@.\n` +
  `- Forex markup fee and its GST are their OWN postings on the SAME entry: ` +
  `\`Expenses:Bank:ForexMarkup  17.51 INR\` and \`Expenses:Tax:GST  3.15 INR\`. ` +
  `Only add them when the statement actually shows a foreign-currency / markup ` +
  `fee row for that charge — NEVER invent markup on a purely domestic INR charge.\n` +
  `- Refund / credit: the expense posting amount is NEGATIVE; its own entry.\n` +
  `- Amounts are plain decimals: \`10155.00\`, never \`10,155.00\`.\n` +
  `- Separate entries with a single blank line. If nothing to extract, reply empty.`

type Posting = { account: string; amount: number; currency: string; billedInr?: number }
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

// Parse the leaner Beancount (header + merchant postings, no card leg).
function parseBeancount(text: string): Txn[] {
  const txns: Txn[] = []
  let cur: Txn | null = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/```\w*/g, '').trimEnd()
    const head = line.match(/^(\d{4}-\d{2}-\d{2})\s+\*\s+"([^"]*)"/)
    if (head) {
      cur = { date: head[1], payee: head[2], postings: [] }
      txns.push(cur)
      continue
    }
    if (!cur) continue
    const m = line.match(
      /^\s+([A-Z][\w:]+)\s+(-?[\d.]+)\s+([A-Z]{3})(?:\s+@@\s+(-?[\d.]+)\s+INR)?/,
    )
    if (m) {
      const p: Posting = { account: m[1], amount: parseFloat(m[2]), currency: m[3] }
      if (m[4]) p.billedInr = parseFloat(m[4])
      cur.postings.push(p)
    }
  }
  return txns.filter((t) => t.postings.length > 0)
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
    if (p.currency !== 'INR' && p.billedInr != null)
      lines.push(`  ${p.account.padEnd(48)} ${fmt(p.amount)} ${p.currency} @@ ${fmt(p.billedInr)} INR`)
    else lines.push(`  ${p.account.padEnd(48)} ${fmt(p.amount)} INR`)
  }
  lines.push(`  ${CARD.padEnd(48)} ${fmt(-card)} INR`)
  return lines.join('\n')
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error('Set CLOUDFLARE_API_TOKEN')
    process.exit(1)
  }
  const stmtPath = process.argv[2] || path.join(here, 'statement.txt')
  const statementText = await readFile(stmtPath, 'utf8')
  const snapshot = await loadSnapshot()
  const filename = path.basename(stmtPath)
  const system = buildStatementExtractionPrompt() + OUTPUT_FORMAT
  const userMsg = `${buildExtractionContextBlock(snapshot, filename)}\n\n---\n\n${statementText}`

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
  const json = (await res.json()) as {
    success?: boolean
    result?: {
      response?: string
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    errors?: unknown
  }
  const ms = Date.now() - t0
  if (!res.ok || json.success === false) {
    console.error(`HTTP ${res.status}`, JSON.stringify(json.errors ?? json))
    process.exit(1)
  }
  const raw =
    json.result?.response ?? json.result?.choices?.[0]?.message?.content ?? ''
  const u = json.result?.usage
  const pin = u?.prompt_tokens ?? 0
  const pout = u?.completion_tokens ?? 0
  const cost = (pin / 1e6) * PRICE.in + (pout / 1e6) * PRICE.out

  const txns = parseBeancount(raw)
  const beancount = txns.map(render).join('\n\n')
  const outDir = path.join(here, 'out')
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'gemma-4.compact.raw.txt'), raw.trim() + '\n')
  const bcFile = path.join(outDir, 'gemma-4.compact.beancount')
  await writeFile(bcFile, beancount + '\n')

  let debit = 0
  let credit = 0
  for (const t of txns) {
    const w = t.postings.reduce((s, p) => s + weightInr(p), 0)
    if (w >= 0) debit += w
    else credit += -w
  }
  console.log(`${MODEL}  enable_thinking=false  COMPACT  ${ms}ms  in=${pin} out=${pout} cost=$${cost.toFixed(5)}`)
  console.log(`transactions=${txns.length}  debit=${fmt(debit)}  credit=${fmt(credit)}`)
  console.log(`-> ${path.relative(process.cwd(), bcFile)}\n`)
  console.log(beancount)
}

main()
