import { parse, BeancountParseError, type Posting, type Transaction as BeanTxn } from 'beancount'

export interface ExtractedTxn {
  date: number
  flag: string | null
  t_payee: string
  t_account: string
  t_currency: string
  t_tag: string
  t_link: string
}

export type ExtractResult =
  | { ok: true; value: ExtractedTxn }
  | { ok: false; errors: string[] }

const BALANCE_TOLERANCE = 0.005

type Weight = { n: number; ccy: string }

function postingWeight(p: Posting): Weight | null {
  if (p.amount == null || !p.currency) return null
  const n = parseFloat(p.amount)
  if (!Number.isFinite(n)) return null
  if (p.priceAmount != null && p.priceCurrency) {
    const pn = parseFloat(p.priceAmount)
    if (!Number.isFinite(pn)) return null
    if (p.atSigns === 2) {
      const sign = n < 0 ? -1 : 1
      return { n: sign * pn, ccy: p.priceCurrency }
    }
    return { n: n * pn, ccy: p.priceCurrency }
  }
  return { n, ccy: p.currency }
}

function checkBalance(postings: readonly Posting[], errors: string[]): void {
  const sums = new Map<string, number>()
  let elided = 0
  for (const p of postings) {
    if (p.amount == null) {
      elided += 1
      continue
    }
    const w = postingWeight(p)
    if (w == null) continue
    sums.set(w.ccy, (sums.get(w.ccy) ?? 0) + w.n)
  }
  if (elided > 1) {
    errors.push('At most one posting may have an elided amount.')
    return
  }
  const unbalanced = [...sums].filter(([, v]) => Math.abs(v) > BALANCE_TOLERANCE)
  if (elided === 1 && unbalanced.length !== 1) {
    errors.push(
      `Cannot auto-balance elided posting: need exactly one unbalanced commodity, found ${unbalanced.length}.`,
    )
    return
  }
  if (elided === 0 && unbalanced.length > 0) {
    const detail = unbalanced
      .map(([c, v]) => `${c}=${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2)}`)
      .join(', ')
    errors.push(`Unbalanced transaction: ${detail}.`)
  }
}

function normalizeFlag(flag: string | undefined): string | null | 'invalid' {
  if (flag == null || flag === '') return null
  if (flag === '*') return 'cleared'
  if (flag === '!') return 'pending'
  return 'invalid'
}

function dedupeJoin(words: Iterable<string>): string {
  const seen = new Set<string>()
  for (const w of words) {
    const lower = w.toLowerCase()
    if (lower) seen.add(lower)
  }
  return [...seen].join(' ')
}

function* splitWords(s: string | undefined): Generator<string> {
  if (!s) return
  for (const w of s.split(/\s+/)) if (w) yield w
}

function extractFields(t: BeanTxn): ExtractedTxn {
  const payeeWords: string[] = []
  for (const w of splitWords(t.payee)) payeeWords.push(w)

  const accountWords: string[] = []
  const currencyWords: string[] = []
  for (const p of t.postings) {
    for (const seg of p.account.split(':')) if (seg) accountWords.push(seg)
    if (p.currency) currencyWords.push(p.currency)
    if (p.priceCurrency) currencyWords.push(p.priceCurrency)
  }

  const tagWords: string[] = []
  for (const tag of t.tags) if (tag.content) tagWords.push(tag.content)

  const linkWords: string[] = []
  for (const link of t.links) if (link) linkWords.push(link)

  return {
    date: t.date.year * 10000 + t.date.month * 100 + t.date.day,
    flag: normalizeFlag(t.flag) as string | null,
    t_payee: dedupeJoin(payeeWords),
    t_account: dedupeJoin(accountWords),
    t_currency: dedupeJoin(currencyWords),
    t_tag: dedupeJoin(tagWords),
    t_link: dedupeJoin(linkWords),
  }
}

export type ValidationResult = { ok: true } | { ok: false; errors: string[] }

export function validateTxn(source: string): ValidationResult {
  const r = extractTxn(source)
  if (r.ok !== true) return { ok: false, errors: r.errors }
  return { ok: true }
}

export function extractTxn(source: string): ExtractResult {
  const trimmed = source.trim()
  if (!trimmed) return { ok: false, errors: ['Empty input.'] }

  let result
  try {
    result = parse(trimmed)
  } catch (err) {
    if (err instanceof BeancountParseError) return { ok: false, errors: [err.message] }
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] }
  }

  if (result.transactions.length !== 1) {
    return {
      ok: false,
      errors: [`Expected exactly one transaction, found ${result.transactions.length}.`],
    }
  }

  const t = result.transactions[0]
  const errors: string[] = []

  if (normalizeFlag(t.flag) === 'invalid') {
    errors.push(`Flag must be '*' or '!'; got '${t.flag}'.`)
  }
  if (t.date.year < 1900) {
    errors.push(`Date year must be >= 1900; got ${t.date.year}.`)
  }
  checkBalance(t.postings, errors)

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: extractFields(t) }
}
