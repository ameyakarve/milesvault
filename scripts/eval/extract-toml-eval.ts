// TOML-output extraction experiment. Mirror of extract-json-eval.ts but the
// model emits TOML (array-of-tables, inline-table postings). WE render
// Beancount and derive the balancing card leg, identical to the JSON path —
// so this isolates "does the serialization format change pairing quality?".
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/extract-toml-eval.ts [statement.txt]

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

const TOML_OUTPUT_FORMAT =
  `\n\n---\n\n# Output format (strict) — OVERRIDES any earlier instruction\n\n` +
  `Ignore any earlier instruction to emit raw Beancount. Instead emit TOML, ` +
  `nothing else (no prose, no code fences). One array-of-tables entry per ` +
  `transaction, postings as an array of inline tables:\n\n` +
  '```\n' +
  `[[transactions]]\n` +
  `date = "YYYY-MM-DD"\n` +
  `payee = "MERCHANT NAME"\n` +
  `narration = "short human label"\n` +
  `postings = [\n` +
  `  { account = "Expenses:...", amount = 123.45, currency = "INR" },\n` +
  `]\n` +
  '```\n\n' +
  `Rules:\n` +
  `- List ONLY the merchant-side postings (expense/income legs). Do NOT emit ` +
  `the credit-card liability leg — it is derived automatically as the negative ` +
  `sum of the INR weights. Never output a Liabilities:CreditCards:... posting.\n` +
  `- Domestic INR charge: one posting, currency "INR".\n` +
  `- Foreign charge billed with an exchange rate: the merchant posting carries ` +
  `the foreign amount plus the INR it converted to — ` +
  `\`{ account = "...", amount = 9.28, currency = "USD", billed_inr = 875.30 }\`. ` +
  `billed_inr is the INR printed on the statement, verbatim.\n` +
  `- Foreign merchant billed directly in INR (DCC): currency "INR", no ` +
  `billed_inr.\n` +
  `- Forex markup fee and its GST are their OWN inline tables in the SAME ` +
  `transaction's postings array: ` +
  `\`{ account = "Expenses:Bank:ForexMarkup", amount = 17.51, currency = "INR" }\` ` +
  `and \`{ account = "Expenses:Tax:GST", amount = 3.15, currency = "INR" }\`. ` +
  `Pair them to the merchant by arithmetic (markup ≈ 2% of INR billed, GST ≈ ` +
  `18% of markup). Never emit a transaction whose only posting is a bare ` +
  `markup or GST fee.\n` +
  `- Refund / credit (not a card payment): the expense posting amount is ` +
  `NEGATIVE. Each credit row is its own transaction.\n` +
  `- Amounts are plain decimals: 10155.00, never 10,155.00.\n` +
  `- Skip non-transaction rows (payments, balances, limits, reward-point ` +
  `totals). If nothing to extract, emit no transactions.`

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

function stripFence(text: string): string {
  const f = text.match(/```(?:toml)?\s*([\s\S]*?)```/)
  return (f ? f[1] : text).trim()
}

function unquote(v: string): string {
  const t = v.trim()
  return t.startsWith('"') || t.startsWith("'") ? t.slice(1, -1) : t
}

// Parse one inline table body: account = "...", amount = 1.2, currency = "INR".
// Account/currency strings contain no commas, so a naive comma split is safe.
function parseInlineTable(body: string): Posting {
  const p: Record<string, string> = {}
  for (const part of body.split(',')) {
    const m = part.match(/^\s*(\w+)\s*=\s*(.+?)\s*$/)
    if (m) p[m[1]] = m[2]
  }
  const out: Posting = {
    account: unquote(p.account ?? ''),
    amount: parseFloat(p.amount ?? '0'),
    currency: unquote(p.currency ?? 'INR'),
  }
  if (p.billed_inr != null) out.billed_inr = parseFloat(p.billed_inr)
  return out
}

// Minimal parser for exactly the TOML shape we requested.
function parseToml(text: string): { transactions: Txn[] } {
  const lines = stripFence(text).split('\n')
  const txns: Txn[] = []
  let cur: Txn | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '[[transactions]]') {
      cur = { date: '', postings: [] }
      txns.push(cur)
      continue
    }
    if (!cur) continue
    const kv = line.match(/^(\w+)\s*=\s*(.*)$/)
    if (!kv) continue
    const [, key, rest] = kv
    if (key === 'postings') {
      // Accumulate until the array brackets balance.
      let buf = rest
      let depth =
        (buf.match(/\[/g)?.length ?? 0) - (buf.match(/\]/g)?.length ?? 0)
      while (depth > 0 && i + 1 < lines.length) {
        const nxt = lines[++i]
        buf += '\n' + nxt
        depth +=
          (nxt.match(/\[/g)?.length ?? 0) - (nxt.match(/\]/g)?.length ?? 0)
      }
      for (const tbl of buf.matchAll(/\{([^}]*)\}/g)) {
        cur.postings.push(parseInlineTable(tbl[1]))
      }
    } else if (key === 'date') cur.date = unquote(rest)
    else if (key === 'payee') cur.payee = unquote(rest)
    else if (key === 'narration') cur.narration = unquote(rest)
  }
  return { transactions: txns }
}

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
  lines.push(`  ${CARD.padEnd(48)} ${fmt(-cardWeight)} INR`)
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
  const system = buildStatementExtractionPrompt() + TOML_OUTPUT_FORMAT
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
  await writeFile(path.join(outDir, 'kimi-k2.6.toml'), raw.trim() + '\n')

  let parsed: { transactions: Txn[] }
  try {
    parsed = parseToml(raw)
  } catch (e) {
    console.error('TOML parse FAILED:', (e as Error).message)
    console.error(raw.slice(0, 1500))
    process.exit(1)
  }

  const txns = parsed.transactions ?? []
  const beancount = txns.map(renderTxn).join('\n\n')
  const bcFile = path.join(outDir, 'kimi-k2.6.from-toml.beancount')
  await writeFile(bcFile, beancount + '\n')

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
