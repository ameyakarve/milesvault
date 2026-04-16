import { headers as getHeaders } from 'next/headers.js'
import { getPayload } from 'payload'
import {
  streamText,
  tool,
  convertToModelMessages,
  wrapLanguageModel,
  simulateStreamingMiddleware,
  stepCountIs,
  type UIMessage,
} from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { z } from 'zod'

import config from '@/payload.config'
import { buildExamplesPrompt } from '@/lib/beancount/examples'

const router = createOpenAICompatible({
  name: 'dd-model-router',
  baseURL: 'https://dd-model-router.ameyakarve.workers.dev',
})

const model = wrapLanguageModel({
  model: router.chatModel('dynamic/edit'),
  middleware: simulateStreamingMiddleware(),
})

const createTxnSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe(
      'Raw beancount source. One or more transactions separated by blank lines. Each transaction header is "YYYY-MM-DD FLAG \\"payee\\" \\"narration\\" ^optional-link". Postings are indented two spaces.',
    ),
})

const listTxnsSchema = z.object({
  fromDate: z.string().optional().describe('Inclusive ISO date, e.g. "2026-03-01"'),
  toDate: z.string().optional().describe('Inclusive ISO date, e.g. "2026-03-31"'),
  accountContains: z
    .string()
    .optional()
    .describe('Filter to txns with any posting whose account path contains this substring'),
  payeeContains: z.string().optional().describe('Substring match on payee'),
  narrationContains: z.string().optional().describe('Substring match on narration'),
  limit: z.number().int().min(1).max(100).default(50),
})

type TxnPosting = {
  account?: { path?: string } | number | null
  amountNumber?: number | null
  amountCommodity?: { code?: string } | number | null
}

type TxnDoc = {
  id: number
  date: string
  flag?: string | null
  payee?: string | null
  narration?: string | null
  postings?: TxnPosting[] | null
}

export const POST = async (request: Request): Promise<Response> => {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as { messages: UIMessage[] }

  const [accountsRes, commoditiesRes] = await Promise.all([
    payload.find({
      collection: 'accounts',
      limit: 500,
      user,
      overrideAccess: false,
      depth: 0,
    }),
    payload.find({
      collection: 'commodities',
      limit: 500,
      user,
      overrideAccess: false,
      depth: 0,
    }),
  ])

  const accountList = accountsRes.docs.map((a) => `  - ${a.path} (${a.type})`).join('\n')
  const commodityList = commoditiesRes.docs.map((c) => `  - ${c.code}`).join('\n')

  const systemPrompt = `You are MilesVault's transaction assistant. You produce beancount source for the user to review and save.

A beancount DOCUMENT is one or more TRANSACTIONS separated by blank lines.
A TRANSACTION is a header line plus one or more POSTING lines indented two spaces.
Header: \`YYYY-MM-DD <flag> "payee" "narration" ^optional-link\`
Flag: \`*\` for cleared, \`!\` for pending.
Posting: \`  Account:Path    AMOUNT COMMODITY [@@ PRICE_AMOUNT PRICE_COMMODITY]\`.
Every transaction must balance per commodity — the signed postings in each commodity must sum to zero.
Transactions that belong together (a subscription, a trip, a statement) should share a \`^link-id\` (kebab-case, short, semantic).

Below are the building blocks. Primitives are atomic posting patterns. Compositions show how primitives stack within one transaction or across multiple.

${buildExamplesPrompt()}

## Your accounts
${accountList || '  (none)'}

## Your commodities
${commodityList || '  (none)'}

## Rules when emitting
- Call the \`createTxn\` tool with a single \`text\` field holding the full beancount document.
- Use ONLY account paths and commodity codes from the lists above. Never invent new ones. If the user asks for something that requires an account or commodity you don't have, tell them what's missing and ask them to create it before you draft.
- Prefer concise clarifying questions over guessing dates, amounts, or accounts.
- Date today is the user's current date unless they say otherwise.

## Reading existing data
When the user asks about history, balances, or filtering, call the \`listTxns\` tool first and answer from its results. Do not fabricate transactions you haven't fetched.`

  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(body.messages),
    stopWhen: stepCountIs(5),
    tools: {
      createTxn: tool({
        description:
          'Propose one or more beancount transactions for the user to review, edit, and save.',
        inputSchema: createTxnSchema,
      }),
      listTxns: tool({
        description:
          'Fetch existing transactions for the current user, filtered by date range, account, payee, or narration.',
        inputSchema: listTxnsSchema,
        execute: async (input) => {
          const where: Record<string, unknown> = {}
          const and: Array<Record<string, unknown>> = []
          if (input.fromDate) and.push({ date: { greater_than_equal: input.fromDate } })
          if (input.toDate) and.push({ date: { less_than_equal: input.toDate } })
          if (input.payeeContains) and.push({ payee: { like: input.payeeContains } })
          if (input.narrationContains) and.push({ narration: { like: input.narrationContains } })
          if (and.length > 0) where.and = and

          const res = await payload.find({
            collection: 'txns',
            where,
            limit: input.limit,
            sort: '-date',
            depth: 1,
            user,
            overrideAccess: false,
          })

          const rows = (res.docs as unknown as TxnDoc[]).map((t) => ({
            id: t.id,
            date: t.date,
            flag: t.flag ?? '*',
            payee: t.payee ?? null,
            narration: t.narration ?? null,
            postings: (t.postings ?? []).map((p) => ({
              account:
                p.account && typeof p.account === 'object' ? p.account.path ?? null : null,
              amount: p.amountNumber ?? null,
              commodity:
                p.amountCommodity && typeof p.amountCommodity === 'object'
                  ? p.amountCommodity.code ?? null
                  : null,
            })),
          }))

          const filtered = input.accountContains
            ? rows.filter((t) =>
                t.postings.some((p) => p.account && p.account.includes(input.accountContains!)),
              )
            : rows

          return { count: filtered.length, transactions: filtered }
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse({
    onError: (err) => (err instanceof Error ? err.message : String(err)),
  })
}
