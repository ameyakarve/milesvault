import { headers as getHeaders } from 'next/headers.js'
import { getPayload } from 'payload'
import { streamText, tool, convertToModelMessages, type UIMessage } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { z } from 'zod'

import config from '@/payload.config'

const router = createOpenAICompatible({
  name: 'dd-model-router',
  baseURL: 'https://dd-model-router.ameyakarve.workers.dev',
})

const postingSchema = z.object({
  account: z.string().describe('Full account path, e.g. "Expenses:Food:Dining"'),
  amount: z.number().describe('Signed decimal amount. Negative for credits, positive for debits.'),
  commodity: z.string().describe('Commodity code, e.g. "INR" or "SMARTBUY_POINTS"'),
})

const createTxnSchema = z.object({
  date: z.string().describe('ISO date, e.g. "2026-04-14"'),
  flag: z.string().max(1).default('*').describe('* cleared, ! pending'),
  payee: z.string().optional(),
  narration: z.string().optional(),
  postings: z.array(postingSchema).min(2).describe('At least 2 postings. Must balance per commodity.'),
})

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

  const accountList = accountsRes.docs
    .map((a) => `  - ${a.path} (${a.type})`)
    .join('\n')
  const commodityList = commoditiesRes.docs
    .map((c) => `  - ${c.code}`)
    .join('\n')

  const systemPrompt = `You are MilesVault's transaction assistant. You help the user record credit card purchases, reward earnings, redemptions, and transfers as beancount-style double-entry transactions.

Current user accounts:
${accountList}

Available commodities:
${commodityList}

When the user describes a transaction, call the createTxn tool with structured data. Use ONLY account paths and commodity codes from the lists above — do not invent new ones. If a needed account or commodity doesn't exist, tell the user what's missing and ask them to create it first. Every transaction must balance: per commodity, the signed postings must sum to zero. Prefer concise clarifying questions over guessing.`

  const result = streamText({
    model: router.chatModel('dynamic/edit'),
    system: systemPrompt,
    messages: await convertToModelMessages(body.messages),
    tools: {
      createTxn: tool({
        description: 'Propose a new transaction for the user to review and confirm.',
        inputSchema: createTxnSchema,
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}
