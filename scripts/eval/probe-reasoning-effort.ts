// Probe whether gemma-4's documented `reasoning_effort` param actually changes
// behavior. Same trivial prompt; vary the param across the OpenAI-standard
// values. If it works, completion_tokens (reasoning burn) should drop from
// high -> low. Prior probe used 'none'/'low' and saw no effect; this retries
// the documented enum.
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/probe-reasoning-effort.ts

const MODEL = '@cf/google/gemma-4-26b-a4b-it'
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || 'e0bc1f55dc6fc3f8fe870087199a2ee3'

const PROMPT = 'What is 2 + 2? Answer with just the number.'

async function run(effort: string | null) {
  const body: Record<string, unknown> = {
    messages: [{ role: 'user', content: PROMPT }],
    max_tokens: 4000,
  }
  if (effort !== null) body.reasoning_effort = effort
  const t0 = Date.now()
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  const ms = Date.now() - t0
  const json = (await res.json()) as {
    success?: boolean
    result?: {
      response?: string
      usage?: { completion_tokens?: number; prompt_tokens?: number }
    }
    errors?: unknown
  }
  if (!res.ok || json.success === false) {
    console.log(`effort=${effort ?? '(none)'}  HTTP ${res.status}  ${JSON.stringify(json.errors ?? json)}`)
    return
  }
  const out = json.result?.usage?.completion_tokens
  const inTok = json.result?.usage?.prompt_tokens
  const resp = (json.result?.response ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  console.log(`effort=${String(effort ?? '(none)').padEnd(8)}  ${ms}ms  in=${inTok}  out=${out}  resp="${resp}"`)
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error('Set CLOUDFLARE_API_TOKEN')
    process.exit(1)
  }
  for (const e of [null, 'low', 'medium', 'high']) {
    await run(e)
  }
}

main()
