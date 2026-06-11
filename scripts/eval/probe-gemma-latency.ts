// Decompose gemma's latency: stream the response and measure time-to-first-
// token (prefill / prompt-processing, input-bound) vs total (decode, output-
// bound). Tells us whether to trim the prompt or trim the output to go faster.
// Reasoning OFF via enable_thinking:false. Same prompt as extract-gemma-nothink.
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/probe-gemma-latency.ts [statement.txt]

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  buildStatementExtractionPrompt,
  buildExtractionContextBlock,
} from '../../src/durable/agent-prompt'

const MODEL = '@cf/google/gemma-4-26b-a4b-it'
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || 'e0bc1f55dc6fc3f8fe870087199a2ee3'
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
        stream: true,
        chat_template_kwargs: { enable_thinking: false },
      }),
    },
  )
  if (!res.ok || !res.body) {
    console.error(`HTTP ${res.status}`, await res.text())
    process.exit(1)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let ttft = 0
  let chunks = 0
  let chars = 0
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!ttft) ttft = Date.now() - t0
    chunks++
    buf += decoder.decode(value, { stream: true })
    // SSE: lines like `data: {json}`; accumulate content length only.
    for (const line of buf.split('\n')) {
      const m = line.match(/^data:\s*(\{.*\})\s*$/)
      if (m) {
        try {
          const j = JSON.parse(m[1])
          const c = j.response ?? j.choices?.[0]?.delta?.content ?? ''
          chars += c.length
        } catch {}
      }
    }
    buf = buf.slice(buf.lastIndexOf('\n') + 1)
  }
  const total = Date.now() - t0
  const decode = total - ttft
  console.log(`MODEL ${MODEL}  enable_thinking=false  stream=true`)
  console.log(`prompt chars=${userMsg.length + system.length} (~${Math.round((userMsg.length + system.length) / 4)} tok est)`)
  console.log(`TTFT (prefill) = ${ttft}ms`)
  console.log(`decode         = ${decode}ms  over ${chunks} chunks, ${chars} content chars`)
  console.log(`TOTAL          = ${total}ms`)
  console.log(`split: prefill ${Math.round((ttft / total) * 100)}%  /  decode ${Math.round((decode / total) * 100)}%`)
}

main()
