// Gemma-4 extraction with reasoning OFF via the chat-template kwarg that
// actually works: `enable_thinking: false` (top-level reasoning_effort and
// `thinking:false` are both silently ignored by gemma on Workers AI). Same
// prompt/statement/snapshot as extract-eval.ts so latency + correctness are
// directly comparable to the reasoning-on baseline (147.9s) and to golden.
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/extract-gemma-nothink.ts [statement.txt]

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
const PRICE = { in: 0.1, out: 0.3 } // USD per 1M tokens

const here = path.dirname(new URL(import.meta.url).pathname)

const OUTPUT_FORMAT =
  `\n\n---\n\n# Output format (strict)\n\n` +
  `Emit the extracted transactions as raw Beancount entries, nothing else. Rules:\n\n` +
  `- One entry per transaction. Each entry starts with a \`YYYY-MM-DD\` date at column 0 (no leading whitespace), followed by postings on indented lines.\n` +
  `- Separate consecutive entries with a single blank line.\n` +
  `- Amounts are plain decimals: \`10155.00\`, never \`10,155.00\`. No thousands separators, no currency symbols on the number.\n` +
  `- No prose, no preamble, no summary, no closing remarks, no fenced code blocks, no comments narrating what you found. The reply is only Beancount.\n` +
  `- If the statement genuinely has nothing to extract, reply with an empty string. Do NOT invent placeholder entries.`

function todayInt(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

async function loadSnapshot() {
  const p = path.join(here, 'snapshot.json')
  if (existsSync(p)) return JSON.parse(await readFile(p, 'utf8'))
  return { today: todayInt(), accounts: [] }
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
      choices?: Array<{ message?: { content?: string; reasoning?: string | null } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    errors?: unknown
  }
  const ms = Date.now() - t0
  if (!res.ok || json.success === false) {
    console.error(`HTTP ${res.status}`, JSON.stringify(json.errors ?? json))
    process.exit(1)
  }
  const msg = json.result?.choices?.[0]?.message
  const text = json.result?.response ?? msg?.content ?? '(empty)'
  const u = json.result?.usage
  const pin = u?.prompt_tokens ?? 0
  const pout = u?.completion_tokens ?? 0
  const cost = (pin / 1e6) * PRICE.in + (pout / 1e6) * PRICE.out

  const outDir = path.join(here, 'out')
  await mkdir(outDir, { recursive: true })
  const outFile = path.join(outDir, 'gemma-4.nothink.beancount')
  await writeFile(outFile, text.trim() + '\n')

  console.log(`${MODEL}  enable_thinking=false  ${ms}ms  in=${pin} out=${pout} cost=$${cost.toFixed(5)}`)
  console.log(`reasoning field: ${msg?.reasoning === null ? 'null (off)' : JSON.stringify(msg?.reasoning)?.slice(0, 40)}`)
  console.log(`-> ${path.relative(process.cwd(), outFile)}\n`)
  console.log(text.trim() || '(empty)')
}

main()
