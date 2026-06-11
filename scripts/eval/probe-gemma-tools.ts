// Does gemma-4 actually emit structured tool calls on Workers AI? Give it one
// tool and a prompt that clearly needs it. If it returns tool_calls -> it can.
// If it returns prose (the call typed out as text) -> it can't (reliably).
//
//   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/eval/probe-gemma-tools.ts

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'e0bc1f55dc6fc3f8fe870087199a2ee3'

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'draft_transaction',
      description: 'Propose beancount transactions for the user to approve.',
      parameters: {
        type: 'object',
        properties: {
          transactions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string' },
                narration: { type: 'string' },
                amount: { type: 'number' },
              },
              required: ['date', 'narration', 'amount'],
            },
          },
        },
        required: ['transactions'],
      },
    },
  },
]

const STATEMENT = `HSBC Card ending 1234  Statement 2026-01
05 Jan  AMAZON IN          1,299.00
12 Jan  SWIGGY             456.50
18 Jan  SHELL PETROL       2,000.00`

async function run(model: string, kwargs?: Record<string, unknown>) {
  const body: Record<string, unknown> = {
    messages: [
      {
        role: 'system',
        content:
          'You turn card statements into transactions. When given a statement, call draft_transaction with one entry per purchase row. Do not reply in prose.',
      },
      { role: 'user', content: STATEMENT },
    ],
    tools: TOOLS,
    max_tokens: 2000,
  }
  if (kwargs) body.chat_template_kwargs = kwargs
  const t0 = Date.now()
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
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
      response?: string | unknown
      tool_calls?: unknown[]
      choices?: Array<{ message?: { content?: string; tool_calls?: unknown[] } }>
    }
    errors?: unknown
  }
  if (!res.ok || json.success === false) {
    console.log(`\n${model} ${JSON.stringify(kwargs ?? {})}\n  HTTP ${res.status} ${JSON.stringify(json.errors ?? json).slice(0, 200)}`)
    return
  }
  const r = json.result
  const topCalls = r?.tool_calls
  const msg = r?.choices?.[0]?.message
  const msgCalls = msg?.tool_calls
  const calls = (Array.isArray(topCalls) && topCalls.length ? topCalls : msgCalls) ?? []
  const text = typeof r?.response === 'string' ? r.response : (msg?.content ?? JSON.stringify(r?.response))
  console.log(`\n${model} ${JSON.stringify(kwargs ?? {})}  ${ms}ms`)
  console.log(`  tool_calls: ${Array.isArray(calls) ? calls.length : 'n/a'}`)
  if (Array.isArray(calls) && calls.length) {
    console.log(`  -> ${JSON.stringify(calls).slice(0, 400)}`)
  }
  if (text) console.log(`  text: ${String(text).replace(/\s+/g, ' ').trim().slice(0, 200)}`)
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error('Set CLOUDFLARE_API_TOKEN')
    process.exit(1)
  }
  await run('@cf/google/gemma-4-26b-a4b-it', { enable_thinking: false })
  await run('@cf/google/gemma-4-26b-a4b-it')
  await run('@cf/moonshotai/kimi-k2.6', { thinking: false })
}

main()
