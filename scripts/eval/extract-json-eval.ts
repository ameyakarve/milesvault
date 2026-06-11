// JSON-output extraction experiment. Same statement + domain prompt, but the
// model emits structured JSON instead of raw Beancount; WE render Beancount and
// derive the balancing card leg. Goal: see whether offloading the arithmetic
// (card leg = -sum of INR weights) kills the forex mis-pairing/bare-GST bugs.
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/extract-json-eval.ts [statement.txt]

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
// The card the statement belongs to. In prod this is derived from the snapshot
// / statement header, not hardcoded — fixed here for the eval.
const CARD = 'Liabilities:CreditCards:Axis:MagnusBurgundy:3467'

const here = path.dirname(new URL(import.meta.url).pathname)

// Override the raw-Beancount output contract with a JSON-schema one. The model
// never emits the card leg or does any balancing arithmetic — it only reports
// the merchant-side postings; our renderer adds the balancing card posting.
const JSON_OUTPUT_FORMAT =
  `\n\n---\n\n# Output format (strict) — OVERRIDES any earlier instruction\n\n` +
  `Ignore any earlier instruction to emit raw Beancount. Instead emit a single ` +
  `JSON object, nothing else (no prose, no code fences), matching this shape:\n\n` +
  '```\n' +
  `{\n` +
  `  "transactions": [\n` +
  `    {\n` +
  `      "date": "YYYY-MM-DD",\n` +
  `      "payee": "MERCHANT NAME",\n` +
  `      "narration": "short human label",\n` +
  `      "postings": [\n` +
  `        { "account": "Expenses:...", "amount": 123.45, "currency": "INR" }\n` +
  `      ]\n` +
  `    }\n` +
  `  ]\n` +
  `}\n` +
  '```\n\n' +
  `Rules:\n` +
  `- List ONLY the merchant-side postings (the expense/income legs). Do NOT ` +
  `emit the credit-card liability leg — it is derived automatically as the ` +
  `negative sum of the INR weights below. Never output a ` +
  `Liabilities:CreditCards:... posting.\n` +
  `- Domestic INR charge: one posting, currency "INR", amount = the rupee ` +
  `amount.\n` +
  `- Foreign-currency charge billed with an exchange rate: the merchant ` +
  `posting carries the foreign amount plus the INR it converted to — ` +
  `\`"amount": 9.28, "currency": "USD", "billed_inr": 875.30\`. The ` +
  `billed_inr is the INR figure printed on the statement, verbatim.\n` +
  `- Foreign merchant billed directly in INR (DCC): currency "INR", amount = ` +
  `the rupee amount; no billed_inr.\n` +
  `- Forex markup fee and its GST are their OWN postings on the SAME ` +
  `transaction: \`{"account":"Expenses:Bank:ForexMarkup","amount":17.51,` +
  `"currency":"INR"}\` and \`{"account":"Expenses:Tax:GST","amount":3.15,` +
  `"currency":"INR"}\`. Pair them to the merchant by arithmetic (markup ≈ 2% ` +
  `of the INR billed, GST ≈ 18% of the markup). Never emit a transaction whose ` +
  `only posting is a bare markup or GST fee.\n` +
  `- Refund / credit (not a card payment): the expense posting amount is ` +
  `NEGATIVE (e.g. -877.82). Each credit row is its own transaction.\n` +
  `- Amounts are plain decimals: 10155.00, never 10,155.00. No thousands ` +
  `separators, no currency symbols on the number.\n` +
  `- Skip non-transaction rows (payments, balances, limits, reward-point ` +
  `totals). If nothing to extract, return {"transactions": []}.`

type Posting = {
  account: string
  amount: number
  currency: string
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

// INR weight of a posting: the @@ total for foreign legs, the amount otherwise.
function weightInr(p: Posting): number {
  return p.currency !== 'INR' && p.billed_inr != null ? p.billed_inr : p.amount
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
    if (p.currency !== 'INR' && p.billed_inr != null) {
      lines.push(`  ${p.account.padEnd(48)} ${fmt(p.amount)} ${p.currency} @@ ${fmt(p.billed_inr)} INR`)
    } else {
      lines.push(`  ${p.account.padEnd(48)} ${fmt(p.amount)} INR`)
    }
  }
  // Derived balancing leg — model never sees or computes this.
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
  const system = buildStatementExtractionPrompt() + JSON_OUTPUT_FORMAT
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
  await writeFile(path.join(outDir, 'kimi-k2.6.json'), raw.trim() + '\n')

  let parsed: { transactions: Txn[] }
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch (e) {
    console.error('JSON parse FAILED:', (e as Error).message)
    console.error('--- raw (first 1500 chars) ---')
    console.error(raw.slice(0, 1500))
    process.exit(1)
  }

  const txns = parsed.transactions ?? []
  const beancount = txns.map(renderTxn).join('\n\n')
  const bcFile = path.join(outDir, 'kimi-k2.6.from-json.beancount')
  await writeFile(bcFile, beancount + '\n')

  // Reconciliation: sum of all derived card weights, split debit vs credit.
  let debit = 0
  let credit = 0
  for (const t of txns) {
    const w = t.postings.reduce((s, p) => s + weightInr(p), 0)
    if (w >= 0) debit += w
    else credit += -w
  }
  console.log(`${MODEL}  ${ms}ms  in=${u?.prompt_tokens} out=${u?.completion_tokens}`)
  console.log(`transactions=${txns.length}  debit_total=${fmt(debit)}  credit_total=${fmt(credit)}`)
  console.log(`-> ${path.relative(process.cwd(), bcFile)}`)
  console.log(`\n${beancount}`)
}

main()
