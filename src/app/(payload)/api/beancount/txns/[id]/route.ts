import { headers as getHeaders } from 'next/headers.js'
import { getPayload, type RequiredDataFromCollectionSlug } from 'payload'
import { parse, BeancountParseError, type Transaction, type Posting } from 'beancount'

import config from '@/payload.config'
import { validateBeancount } from '@/lib/beancount/validate'

type PostingInput = {
  flag?: string
  account: number
  amountNumber: number
  amountCommodity: number
  price?: {
    kind: 'per_unit' | 'total'
    number: number
    commodity: number
  }
}

type TxnInput = {
  date: string
  flag: string
  payee?: string
  narration?: string
  tags?: string[]
  links?: string[]
  postings: PostingInput[]
}

function mapPosting(
  p: Posting,
  accountMap: Map<string, number>,
  commodityMap: Map<string, number>,
): PostingInput {
  const acctId = accountMap.get(p.account)
  if (acctId == null) throw new Error(`Unknown account: ${p.account}`)
  if (p.amount == null || p.currency == null) {
    throw new Error(`Posting for ${p.account} is missing amount or currency (elision not supported yet)`)
  }
  const ccyId = commodityMap.get(p.currency)
  if (ccyId == null) throw new Error(`Unknown commodity: ${p.currency}`)

  const out: PostingInput = {
    flag: p.flag,
    account: acctId,
    amountNumber: parseFloat(p.amount),
    amountCommodity: ccyId,
  }

  if (p.priceAmount != null && p.priceCurrency != null) {
    const priceCcyId = commodityMap.get(p.priceCurrency)
    if (priceCcyId == null) throw new Error(`Unknown price commodity: ${p.priceCurrency}`)
    out.price = {
      kind: p.atSigns === 2 ? 'total' : 'per_unit',
      number: parseFloat(p.priceAmount),
      commodity: priceCcyId,
    }
  }

  return out
}

function mapTxn(
  t: Transaction,
  accountMap: Map<string, number>,
  commodityMap: Map<string, number>,
): TxnInput {
  return {
    date: t.date.toString(),
    flag: t.flag || '*',
    payee: t.payee || undefined,
    narration: t.narration,
    tags: t.tags.length > 0 ? t.tags.map((tag) => tag.content) : undefined,
    links: t.links.size > 0 ? [...t.links] : undefined,
    postings: t.postings.map((p) => mapPosting(p, accountMap, commodityMap)),
  }
}

export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isFinite(id)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 })
  }

  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { text?: unknown }
  if (typeof body.text !== 'string') {
    return Response.json({ error: 'Expected { text: string }' }, { status: 400 })
  }

  const diagnostics = validateBeancount(body.text)
  if (diagnostics.length > 0) {
    return Response.json(
      { error: 'Validation failed', diagnostics },
      { status: 422 },
    )
  }

  let result
  try {
    result = parse(body.text)
  } catch (err) {
    if (err instanceof BeancountParseError) {
      return Response.json(
        {
          error: 'Parse error',
          detail: err.message,
          location: err.location,
          fragment: err.sourceContent,
        },
        { status: 400 },
      )
    }
    throw err
  }

  if (result.transactions.length !== 1) {
    return Response.json(
      { error: `Expected exactly 1 transaction, got ${result.transactions.length}` },
      { status: 400 },
    )
  }

  const [accountsRes, commoditiesRes] = await Promise.all([
    payload.find({ collection: 'accounts', limit: 500, user, overrideAccess: false, depth: 0 }),
    payload.find({ collection: 'commodities', limit: 500, user, overrideAccess: false, depth: 0 }),
  ])
  const accountMap = new Map(accountsRes.docs.map((a) => [a.path, a.id]))
  const commodityMap = new Map(commoditiesRes.docs.map((c) => [c.code, c.id]))

  let data: TxnInput & { source: string }
  try {
    const txn = result.transactions[0]
    data = { ...mapTxn(txn, accountMap, commodityMap), source: txn.toString() }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    )
  }

  try {
    const doc = await payload.update({
      collection: 'txns',
      id,
      data: data as unknown as Partial<RequiredDataFromCollectionSlug<'txns'>>,
      user,
      overrideAccess: false,
    })
    return Response.json({ doc })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    )
  }
}
