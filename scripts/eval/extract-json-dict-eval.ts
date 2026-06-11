// JSON + dictionary-encoding experiment. The model is given a numbered account
// dictionary and emits `acct: <index>` instead of full account strings; we map
// indices back and derive the card leg. Tests two claims at once: (1) does
// index encoding save output tokens, (2) does forcing a closed vocab via lookup
// help or hurt categorization accuracy?
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/extract-json-dict-eval.ts [statement.txt]

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  buildStatementExtractionPrompt,
  buildExtractionContextBlock,
} from '../../src/durable/agent-prompt'

const MODEL = '@cf/moonshotai/kimi-k2.6'
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || 'e0bc1f55dc6fc3f8fe870087199a2ee3'
const CARD = 'Liabilities:CreditCards:Axis:MagnusBurgundy:3467'

const here = path.dirname(new URL(import.meta.url).pathname)

// Closed account vocabulary. Deliberately broader than what this statement
// needs (distractors) so the model has to actually choose — not just echo.
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
// 1-based index -> account.
const dictBlock = DICT.map((a, i) => `${i + 1} = ${a}`).join('\n')

const JSON_DICT_OUTPUT_FORMAT =
  `\n\n---\n\n# Output format (strict) — OVERRIDES any earlier instruction\n\n` +
  `Ignore any earlier instruction to emit raw Beancount. Use ONLY the numbered ` +
  `account dictionary below — refer to each account by its NUMBER, never its ` +
  `name. Pick the closest fit; use 27 (Misc) only if nothing else fits.\n\n` +
  `Account dictionary:\n${dictBlock}\n\n` +
  `Emit a single JSON object, nothing else (no prose, no fences):\n\n` +
  '```\n' +
  `{\n` +
  `  "transactions": [\n` +
  `    {\n` +
  `      "date": "YYYY-MM-DD",\n` +
  `      "payee": "MERCHANT NAME",\n` +
  `      "narration": "short human label",\n` +
  `      "postings": [\n` +
  `        { "acct": 9, "amount": 123.45, "currency": "INR" }\n` +
  `      ]\n` +
  `    }\n` +
  `  ]\n` +
  `}\n` +
  '```\n\n' +
  `Rules:\n` +
  `- "acct" is the dictionary NUMBER (1-${DICT.length}). "currency" may be ` +
  `omitted when it is "INR".\n` +
  `- List ONLY merchant-side postings. Do NOT emit the credit-card liability ` +
  `leg — it is derived as the negative sum of the INR weights.\n` +
  `- Foreign charge billed with an exchange rate: ` +
  `\`{ "acct": 9, "amount": 9.28, "currency": "USD", "billed_inr": 875.30 }\`. ` +
  `billed_inr is the INR printed on the statement, verbatim.\n` +
  `- Foreign merchant billed directly in INR (DCC): currency "INR", no ` +
  `billed_inr.\n` +
  `- Forex markup fee (acct 24) and its GST (acct 26) are their OWN postings on ` +
  `the SAME transaction. Pair to the merchant by arithmetic (markup ≈ 2% of INR ` +
  `billed, GST ≈ 18% of markup). Never emit a transaction whose only posting is ` +
  `a bare markup or GST fee.\n` +
  `- Refund / credit: the expense posting amount is NEGATIVE; each its own txn.\n` +
  `- Amounts are plain decimals: 10155.00, never 10,155.00.\n` +
  `- Skip non-transaction rows. If nothing to extract, return ` +
  `{"transactions": []}.`

type Posting = {
  acct?: number
  account?: string
  amount: number
  currency?: string
  billed_inr?: number
}
type Txn = {
  date: string
  payee?: string
  narration?: string
  postings: Posting[]
}

function todayInt(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}
async function loadSnapshot() {
  const p = path.join(here, 'snapshot.json')
  if (existsSync(p)) return JSON.parse(await readFile(p, 'utf8'))
  return { today: todayInt(), accounts: [] }
}

function resolveAccount(p: Posting): string {
  if (typeof p.acct === 'number' && p.acct >= 1 && p.acct <= DICT.length)
    return DICT[p.acct - 1]
  if (p.account && p.account.includes(':')) return p.account // model ignored dict
  return `Expenses:UNKNOWN:${p.acct ?? p.account ?? '?'}`
}
function curOf(p: Posting): string {
  return p.currency ?? 'INR'
}
function weightInr(p: Posting): number {
  return curOf(p) !== 'INR' && p.billed_inr != null ? p.billed_inr : p.amount
}
function fmt(n: number): string {
  return n.toFixed(2)
}
function renderTxn(t: Txn): string {
  const head = `${t.date} * ${JSON.stringify(t.payee ?? '')} ${JSON.stringify(t.narration ?? '')}`
  const lines: string[] = [head]
  let cardWeight = 0
  for (const p of t.postings) {
    cardWeight += weightInr(p)
    const acct = resolveAccount(p)
    if (curOf(p) !== 'INR' && p.billed_inr != null) {
      lines.push(`  ${acct.padEnd(48)} ${fmt(p.amount)} ${curOf(p)} @@ ${fmt(p.billed_inr)} INR`)
    } else {
      lines.push(`  ${acct.padEnd(48)} ${fmt(p.amount)} INR`)
    }
  }
  lines.push(`  ${CARD.padEnd(48)} ${fmt(-cardWeight)} INR`)
  return lines.join('\n')
}
function extractJson(text: string): string {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  return start >= 0 && end > start ? t.slice(start, end + 1) : t
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
  const system = buildStatementExtractionPrompt() + JSON_DICT_OUTPUT_FORMAT
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
        chat_template_kwargs: { thinking: false },
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

  const outDir = path.join(here, 'out')
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'kimi-k2.6.dict.json'), raw.trim() + '\n')

  let parsed: { transactions: Txn[] }
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch (e) {
    console.error('JSON parse FAILED:', (e as Error).message)
    console.error(raw.slice(0, 1500))
    process.exit(1)
  }

  const txns = parsed.transactions ?? []
  const beancount = txns.map(renderTxn).join('\n\n')
  const bcFile = path.join(outDir, 'kimi-k2.6.from-dict.beancount')
  await writeFile(bcFile, beancount + '\n')

  let debit = 0
  let credit = 0
  let badIdx = 0
  for (const t of txns) {
    for (const p of t.postings) {
      if (resolveAccount(p).startsWith('Expenses:UNKNOWN')) badIdx++
    }
    const w = t.postings.reduce((s, p) => s + weightInr(p), 0)
    if (w >= 0) debit += w
    else credit += -w
  }
  console.log(`${MODEL}  ${ms}ms  in=${u?.prompt_tokens} out=${u?.completion_tokens}`)
  console.log(`transactions=${txns.length}  debit_total=${fmt(debit)}  credit_total=${fmt(credit)}  bad_indices=${badIdx}`)
  console.log(`-> ${path.relative(process.cwd(), bcFile)}`)
  console.log(`\n${beancount}`)
}

main()
