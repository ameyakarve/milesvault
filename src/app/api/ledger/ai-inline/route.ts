import { NextResponse } from 'next/server'
import {
  streamText,
  stepCountIs,
  tool,
  type ModelMessage,
} from 'ai'
import { z } from 'zod'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createNimChatModel } from '@/lib/chat/nim-provider'
import { withLedger } from '@/lib/ledger-route-handler'
import type { LedgerClient } from '@/lib/ledger-api'
import { buildAccountsBlock } from '@/durable/think-agent-prompt'
import { buildEntriesFromBuffer } from '@/lib/ledger-reader/entries'
import type { MapEntry } from '@/lib/ledger-reader/map'
import { createMapReader } from '@/lib/ledger-reader/map'
import { validateEntry } from '@/lib/beancount/validate-entry'

export const dynamic = 'force-dynamic'

const SEARCH_DESCRIPTION = `Search the transactions currently visible in the editor buffer. Scoped to the current page — entries on other pages are not searchable. If the user asks about something older, ask them to page to it first.

Query grammar (tokens combined by whitespace, all ANDed):
  @<seg>              Match any account segment. Segments split on ':' — '@expenses:food' expands to @expenses AND @food.
  #<tag>              Match a tag.
  ^<link>             Match a link.
  >YYYY-MM-DD         Inclusive start date (>YYYY-MM = start of month).
  <YYYY-MM-DD         Inclusive end date (<YYYY-MM = end of month).
  YYYY-MM..YYYY-MM    Closed date range (day variants also work).
  YYYY-MM-DD          Exact day.
  <free word>         Matches any indexed field (payee, account, currency, tag, link). Narration is NOT indexed.

Rules:
- Prefer concrete filters over free text. Use @account for category filters and a single free token for payee. Don't pass filler words ("all", "this", "month", "by") — they either filter to zero or duplicate an @filter.
- To find a specific txn by payee+date (e.g. "the Amudham one from April 19"), combine a tight date range with the payee as a free token: '>2026-04-19 <2026-04-19 amudham'.
- If 0 hits, broaden (drop the date or widen it) before guessing a different merchant name.
- Empty q returns most-recent first.

Examples:
  "find Amudham on 19 April"   -> q: ">2026-04-19 <2026-04-19 amudham"
  "food spend in April 2026"   -> q: ">2026-04-01 <2026-04-30 @expenses:food"
  "travel tag this month"      -> q: ">2026-04-01 <2026-04-30 #travel"`

const SYSTEM = `You are an inline beancount editor assistant pinned to a tiny
chat widget inside the user's ledger editor. You can propose create/update/delete
ops against ANY transaction in the current buffer — not just the selection. The
selection is context for what the user is most likely asking about.

Use the tools to explore the buffer:
- ledger_search — find transactions by account/tag/date/payee.
- ledger_get — fetch a single transaction's full raw_text by id.
- validate_entry — self-check a beancount entry BEFORE proposing it.

After you have gathered enough context (or right away if the task is obvious),
end your turn with a final text response in exactly this shape:

<reply>one or two sentences summarising what you did (or what you're asking).</reply>
<ops>
[{"op":"update","id":123,"raw_text":"<full replacement beancount entry>"}]
</ops>

Op grammar:
- {"op":"create","raw_text":"<entry>"}  — appends a new entry to the buffer.
- {"op":"update","id":<int>,"raw_text":"<entry>"} — replaces an existing entry.
- {"op":"delete","id":<int>} — removes an existing entry.

Rules:
- Omit <ops> entirely if the user is only asking a question and no edit is needed.
- Each raw_text must be a complete, valid beancount entry (header + all postings).
- Use ids from the "# Row ids" block or from ledger_search/ledger_get results — positive ids map to saved rows currently in the buffer.
- Do not narrate changes inside <ops>. Do not output text outside the two tags.
- Keep <reply> short and user-facing; it will be shown as a chat bubble.
Today's date is ${new Date().toISOString().slice(0, 10)}.`

type SnapshotIn = { id: number; raw_text: string }
type Body = {
  messages: { role: 'user' | 'assistant'; content: string }[]
  buffer: string
  snapshots: SnapshotIn[]
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

function buildIdsBlock(entries: readonly MapEntry[]): string {
  if (entries.length === 0) return '# Row ids\n\n(none — empty buffer)'
  const lines = entries.map((e) => {
    const firstLine = e.raw_text.split('\n', 1)[0].trim()
    return `- id=${e.id}: ${firstLine}`
  })
  return `# Row ids\n\n${lines.join('\n')}`
}

export const POST = withLedger(async ({ client, req, email }) => {
  const { env: rawEnv } = await getCloudflareContext({ async: true })
  const env = rawEnv as Cloudflare.Env
  const body = (await req.json()) as Body
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new NextResponse('bad request', { status: 400 })
  }

  const accounts = await getAccountsCached(email, client)
  const snapshotsLike = (body.snapshots ?? []).map((s) => ({
    id: s.id,
    raw_text: s.raw_text,
    expected_updated_at: 0,
  }))
  const entries = buildEntriesFromBuffer(body.buffer ?? '', snapshotsLike)
  const reader = createMapReader(() => entries)
  const idsBlock = buildIdsBlock(entries)

  const tools = {
    ledger_search: tool({
      description: SEARCH_DESCRIPTION,
      inputSchema: z.object({
        q: z.string().default(''),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      }),
      execute: async ({ q, limit, offset }) => reader.search(q, limit, offset),
    }),
    ledger_get: tool({
      description:
        'Fetch one transaction by id from the current editor buffer. Positive id = saved row currently on this page; negative id = unsaved-create/dirty entry. Returns null if not in the buffer.',
      inputSchema: z.object({ id: z.number().int() }),
      execute: async ({ id }) => reader.get(id),
    }),
    validate_entry: tool({
      description:
        "Run MilesVault's beancount validators on a raw entry string without staging it. Returns {ok, errors[]}. Use this to self-check before emitting an op in <ops>. Checks: parse, balance, payee present, amount required, cashback sign/counterpart, cashback needs payment leg.",
      inputSchema: z.object({ raw_text: z.string().min(1) }),
      execute: async ({ raw_text }) => validateEntry(raw_text),
    }),
  }

  const system = [
    SYSTEM,
    buildAccountsBlock(accounts),
    idsBlock,
    `# Selection (cursor context)\n\n${body.selectionText || '(empty)'}`,
    `# Surrounding lines\n\n${body.surrounding || '(none)'}`,
  ].join('\n\n')

  const result = streamText({
    model: createNimChatModel(env, env.CHAT_MODEL),
    system,
    messages: body.messages as ModelMessage[],
    tools,
    stopWhen: stepCountIs(6),
  })
  return result.toTextStreamResponse()
})
