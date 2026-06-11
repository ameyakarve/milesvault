// Probe whether gemma-4 honors any chat_template_kwargs to disable/throttle
// reasoning. If a kwarg works, completion_tokens for a trivial prompt should
// collapse (no reasoning burn) and result.response should carry the answer.
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/probe-gemma-kwargs.ts

const MODEL = '@cf/google/gemma-4-26b-a4b-it'
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || 'e0bc1f55dc6fc3f8fe870087199a2ee3'

const PROMPT = 'What is 2 + 2? Answer with just the number.'

async function run(label: string, kwargs: Record<string, unknown> | null) {
  const body: Record<string, unknown> = {
    messages: [{ role: 'user', content: PROMPT }],
    max_tokens: 4000,
  }
  if (kwargs) body.chat_template_kwargs = kwargs
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
    console.log(`${label.padEnd(28)} HTTP ${res.status}  ${JSON.stringify(json.errors ?? json).slice(0, 120)}`)
    return
  }
  const out = json.result?.usage?.completion_tokens
  const resp = (json.result?.response ?? '').replace(/\s+/g, ' ').trim().slice(0, 50)
  console.log(`${label.padEnd(28)} ${ms}ms  out=${out}  resp="${resp}"`)
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error('Set CLOUDFLARE_API_TOKEN')
    process.exit(1)
  }
  await run('baseline (no kwargs)', null)
  await run('thinking:false', { thinking: false })
  await run('enable_thinking:false', { enable_thinking: false })
  await run('reasoning:false', { reasoning: false })
  await run('reasoning_effort:none', { reasoning_effort: 'none' })
  await run('add_generation_prompt', { add_generation_prompt: true, thinking: false })
}

main()
