import { NextResponse } from 'next/server'
import { streamText, type ModelMessage } from 'ai'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createNimChatModel } from '@/lib/chat/nim-provider'
import { withLedger } from '@/lib/ledger-route-handler'
import type { LedgerClient } from '@/lib/ledger-api'
import { buildAccountsBlock } from '@/durable/think-agent-prompt'

export const dynamic = 'force-dynamic'

const SYSTEM = `You are an inline beancount editor assistant. The user has opened
a tiny chat widget pinned to a specific spot in their ledger file. Your job is
to answer the user's question about the surrounding text and, when they ask for
a change, propose a replacement for the selected range.

Respond in this shape:

<reply>one or two sentences explaining what you're about to do</reply>
<edit>
<full replacement text for the selected range — valid beancount, no prose>
</edit>

Omit <edit> if the user is only asking a question and no change is needed.
Never put beancount inside <reply>. Never output text outside these tags.
Today's date is ${new Date().toISOString().slice(0, 10)}.`

type Body = {
  messages: { role: 'user' | 'assistant'; content: string }[]
  selectionText: string
  surrounding: string
}

const ACCOUNTS_TTL_MS = 60_000
const accountsCache = new Map<string, { at: number; accounts: string[] }>()

async function getAccountsCached(email: string, client: LedgerClient): Promise<string[]> {
  const hit = accountsCache.get(email)
  const now = Date.now()
  if (hit && now - hit.at < ACCOUNTS_TTL_MS) return hit.accounts
  const accounts = await client.listAccounts()
  accountsCache.set(email, { at: now, accounts })
  return accounts
}

export const POST = withLedger(async ({ client, req, email }) => {
  const { env: rawEnv } = await getCloudflareContext({ async: true })
  const env = rawEnv as Cloudflare.Env
  const body = (await req.json()) as Body
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new NextResponse('bad request', { status: 400 })
  }

  const accounts = await getAccountsCached(email, client)

  const system = [
    SYSTEM,
    buildAccountsBlock(accounts),
    `# Selected range\n\n${body.selectionText || '(empty)'}`,
    `# Surrounding context\n\n${body.surrounding || '(none)'}`,
  ].join('\n\n')

  const result = streamText({
    model: createNimChatModel(env, env.CHAT_MODEL),
    system,
    messages: body.messages as ModelMessage[],
  })
  return result.toTextStreamResponse()
})
