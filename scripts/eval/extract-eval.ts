// Dead-simple extraction eval. Same statement + snapshot fed to every model
// in MODELS; dumps each model's raw Beancount output for eyeball comparison.
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/extract-eval.ts [statement.txt]
//
// Defaults: statement = scripts/eval/statement.txt, snapshot = scripts/eval/
// snapshot.json (falls back to a minimal today/empty-accounts snapshot).

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  buildStatementExtractionPrompt,
  buildExtractionContextBlock,
} from '../../src/durable/agent-prompt'

// --- edit these ---
const MODELS = [
  '@cf/moonshotai/kimi-k2.6',
  '@cf/moonshotai/kimi-k2.5',
  '@cf/google/gemma-4-26b-a4b-it',
]
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || 'e0bc1f55dc6fc3f8fe870087199a2ee3'
// ------------------

const here = path.dirname(new URL(import.meta.url).pathname)

// Same output-format block the subagent appends in runTask. Kept in sync by
// hand — if you change it in statement-extractor.ts, mirror it here.
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

async function runModel(model: string, system: string, statement: string) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: statement },
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
  if (!res.ok || json.success === false) {
    return { text: `!! HTTP ${res.status} ${JSON.stringify(json.errors ?? json)}`, usage: null }
  }
  // Workers AI returns either { response } (legacy) or OpenAI-style
  // { choices: [{ message: { content } }] } (Kimi et al.).
  const text =
    json.result?.response ??
    json.result?.choices?.[0]?.message?.content ??
    '(empty)'
  return { text, usage: json.result?.usage ?? null }
}

// Per-model { input, output } USD per 1M tokens, pulled from the catalogue.
const PRICE: Record<string, { in: number; out: number }> = {
  '@cf/moonshotai/kimi-k2.6': { in: 0.16, out: 4 },
  '@cf/moonshotai/kimi-k2.5': { in: 0.1, out: 3 },
  '@cf/google/gemma-4-26b-a4b-it': { in: 0.1, out: 0.3 },
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

  const outDir = path.join(here, 'out')
  await mkdir(outDir, { recursive: true })

  for (const model of MODELS) {
    const t0 = Date.now()
    const { text, usage } = await runModel(model, system, userMsg)
    const ms = Date.now() - t0
    const slug = model.replace(/^@/, '').replace(/[/]/g, '_')
    const outFile = path.join(outDir, `${slug}.beancount`)
    await writeFile(outFile, text.trim() + '\n')

    const pin = usage?.prompt_tokens ?? 0
    const pout = usage?.completion_tokens ?? 0
    const price = PRICE[model]
    const cost = price
      ? (pin / 1e6) * price.in + (pout / 1e6) * price.out
      : null
    const tokStr = usage
      ? `in=${pin} out=${pout}` +
        (cost != null ? ` cost=$${cost.toFixed(5)}` : '')
      : 'usage=n/a'

    console.log(`\n${'='.repeat(72)}\n${model}  (${ms}ms)  ${tokStr}  -> ${path.relative(process.cwd(), outFile)}\n${'='.repeat(72)}`)
    console.log(text.trim() || '(empty)')
  }
}

main()
