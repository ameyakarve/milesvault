import { type Posting } from 'beancount'

export type SinglePostingGroup = {
  kind: 'single'
  posting: Posting
  index: number
}

export type PointsTransferGroup = {
  kind: 'points-transfer'
  source: Posting
  sink: Posting
  sourceIndex: number
  sinkIndex: number
}

export type TransferVariant = 'transfer' | 'cc-payment' | 'wallet-topup'

export type TransferGroup = {
  kind: 'transfer'
  from: Posting
  to: Posting
  fromIndex: number
  toIndex: number
  variant: TransferVariant
}

export type PostingGroup = SinglePostingGroup | PointsTransferGroup | TransferGroup

const REWARDS_ACCOUNT_PREFIX = 'Assets:Rewards:'
const ASSETS_PREFIX = 'Assets:'
const CC_ACCOUNT_PREFIX = 'Liabilities:CC:'
const WALLET_ACCOUNT_PREFIX = 'Assets:Wallet:'
const GIFT_CARD_ACCOUNT_PREFIX = 'Assets:GiftCard:'

function isRewardsAccount(p: Posting): boolean {
  return !!p.account && p.account.startsWith(REWARDS_ACCOUNT_PREFIX)
}

function hasTotalPriceClause(p: Posting): boolean {
  return !!p.priceAmount && !!p.priceCurrency && p.atSigns === 2
}

function hasAnyPriceClause(p: Posting): boolean {
  return !!p.priceAmount || !!p.priceCurrency
}

function isPointsTransferSource(p: Posting): boolean {
  return isRewardsAccount(p) && !p.priceAmount && !p.priceCurrency
}

function isPointsTransferSink(p: Posting): boolean {
  return isRewardsAccount(p) && hasTotalPriceClause(p)
}

function isTransferEligibleAccount(p: Posting): boolean {
  if (!p.account) return false
  if (p.account.startsWith(REWARDS_ACCOUNT_PREFIX)) return false
  if (p.account.startsWith(GIFT_CARD_ACCOUNT_PREFIX)) return false
  if (p.account.startsWith(ASSETS_PREFIX)) return true
  if (p.account.startsWith(CC_ACCOUNT_PREFIX)) return true
  return false
}

const VARIANT_PREFIXES: readonly [string, TransferVariant][] = [
  [WALLET_ACCOUNT_PREFIX, 'wallet-topup'],
  [CC_ACCOUNT_PREFIX, 'cc-payment'],
]

function chooseTransferVariant(from: Posting, to: Posting): TransferVariant {
  for (const [prefix, variant] of VARIANT_PREFIXES) {
    if (from.account?.startsWith(prefix) || to.account?.startsWith(prefix)) return variant
  }
  return 'transfer'
}

const MAGNITUDE_EPSILON = 0.005

function tryPointsTransferPair(
  a: Posting,
  b: Posting,
): { source: Posting; sink: Posting; sourceIsFirst: boolean } | null {
  let source: Posting
  let sink: Posting
  let sourceIsFirst: boolean

  if (isPointsTransferSource(a) && isPointsTransferSink(b)) {
    source = a
    sink = b
    sourceIsFirst = true
  } else if (isPointsTransferSink(a) && isPointsTransferSource(b)) {
    source = b
    sink = a
    sourceIsFirst = false
  } else {
    return null
  }

  if (!source.currency || !sink.currency) return null
  if (source.currency === sink.currency) return null
  if (sink.priceCurrency !== source.currency) return null

  return { source, sink, sourceIsFirst }
}

function tryTransferPair(
  a: Posting,
  b: Posting,
): { from: Posting; to: Posting; fromIsFirst: boolean; variant: TransferVariant } | null {
  if (!isTransferEligibleAccount(a) || !isTransferEligibleAccount(b)) return null
  if (hasAnyPriceClause(a) || hasAnyPriceClause(b)) return null
  if (!a.currency || !b.currency || a.currency !== b.currency) return null
  if (a.amount == null || b.amount == null) return null
  const aN = parseFloat(a.amount)
  const bN = parseFloat(b.amount)
  if (!Number.isFinite(aN) || !Number.isFinite(bN)) return null
  if (Math.abs(aN + bN) > MAGNITUDE_EPSILON) return null
  if (Math.abs(aN) < MAGNITUDE_EPSILON) return null

  let from: Posting
  let to: Posting
  let fromIsFirst: boolean
  if (aN < 0 && bN > 0) {
    from = a
    to = b
    fromIsFirst = true
  } else if (aN > 0 && bN < 0) {
    from = b
    to = a
    fromIsFirst = false
  } else {
    return null
  }

  return { from, to, fromIsFirst, variant: chooseTransferVariant(from, to) }
}

function pairIndices(firstIsA: boolean, i: number): [number, number] {
  return firstIsA ? [i, i + 1] : [i + 1, i]
}

export function groupPostings(postings: readonly Posting[]): PostingGroup[] {
  const groups: PostingGroup[] = []
  let i = 0
  while (i < postings.length) {
    if (i + 1 < postings.length) {
      const pt = tryPointsTransferPair(postings[i], postings[i + 1])
      if (pt) {
        const [sourceIndex, sinkIndex] = pairIndices(pt.sourceIsFirst, i)
        groups.push({ kind: 'points-transfer', source: pt.source, sink: pt.sink, sourceIndex, sinkIndex })
        i += 2
        continue
      }
      const tr = tryTransferPair(postings[i], postings[i + 1])
      if (tr) {
        const [fromIndex, toIndex] = pairIndices(tr.fromIsFirst, i)
        groups.push({ kind: 'transfer', from: tr.from, to: tr.to, fromIndex, toIndex, variant: tr.variant })
        i += 2
        continue
      }
    }
    groups.push({ kind: 'single', posting: postings[i], index: i })
    i += 1
  }
  return groups
}
