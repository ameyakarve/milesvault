// Probe which flag actually disables the thinking trace on kimi-k2.6.
// A trivial prompt: if reasoning is OFF, completion_tokens collapses and the
// answer lands directly. If ON, out-tokens balloon with the reasoning burn.
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/probe-kimi-thinking.ts

const MODEL = '@cf/moonshotai/kimi-k2.6'
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'e0bc1f55dc6fc3f8fe870087199a2ee3'
const PROMPT = 'What is 17 * 23? Answer with just the number.'

async function run(label: string, extra: Record<string, unknown>) {
  const body: Record<string, unknown> = {
    messages: [{ role: 'user', content: PROMPT }],
    max_tokens: 4000,
    ...extra,
  }
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
      reasoning?: string
      reasoning_content?: string
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
      usage?: { completion_tokens?: number; prompt_tokens?: number }
    }
    errors?: unknown
  }
  if (!res.ok || json.success === false) {
    console.log(`${label.padEnd(34)} HTTP ${res.status}  ${JSON.stringify(json.errors ?? json).slice(0, 140)}`)
    return
  }
  const r = json.result
  const out = r?.usage?.completion_tokens
  const reasoning =
    r?.reasoning_content ?? r?.reasoning ?? r?.choices?.[0]?.message?.reasoning_content ?? ''
  const resp = (r?.response ?? r?.choices?.[0]?.message?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  console.log(`${label.padEnd(34)} ${ms}ms  out=${out}  think=${reasoning.length}ch  resp="${resp}"`)
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error('Set CLOUDFLARE_API_TOKEN')
    process.exit(1)
  }
  await run('baseline (no flags)', {})
  await run('reasoning_effort:low', { reasoning_effort: 'low' })
  await run('reasoning_effort:null', { reasoning_effort: null })
  await run('cтk.enable_thinking:false', { chat_template_kwargs: { enable_thinking: false } })
  await run('ctk.thinking:false', { chat_template_kwargs: { thinking: false } })
}

main()
