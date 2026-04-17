import { parse, BeancountParseError, type Posting, type Transaction as BeanTxn } from 'beancount'
import { CREDIT_CARD_GROUPS } from './account-display'

export interface ExtractedTxn {
  date: number
  flag: string | null
  t_payee: string
  t_account: string
  t_currency: string
  t_tag: string
  t_link: string
}

export type DiagnosticKind = 'rule-violation' | 'parser-unparseable'

export interface Diagnostic {
  kind: DiagnosticKind
  lineOffset: number
  message: string
}

export type ExtractResult =
  | { ok: true; value: ExtractedTxn }
  | { ok: false; diagnostics: Diagnostic[] }

export type ValidationResult = { ok: true } | { ok: false; diagnostics: Diagnostic[] }

export interface Entry {
  text: string
  startLine: number
  endLine: number
}

const DATE_LED = /^\d{4}-\d{2}-\d{2}/
const DIRECTIVE_KEYWORDS =
  /^(option|plugin|pushtag|poptag|include|commodity|balance|pad|open|close|note|document|price|event|query|custom)\b/

export function isUnparseableLine(line: string): boolean {
  if (line.trim() === '') return false
  if (line.startsWith(' ') || line.startsWith('\t')) return false
  if (line.trimStart().startsWith(';')) return false
  if (DATE_LED.test(line) || DIRECTIVE_KEYWORDS.test(line)) return false
  return true
}

export function splitEntries(source: string): Entry[] {
  const lines = source.split('\n')
  const entries: Entry[] = []
  let start = -1
  let buffer: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const startsNewEntry = DATE_LED.test(line) || DIRECTIVE_KEYWORDS.test(line)
    if (startsNewEntry) {
      if (start >= 0) {
        entries.push({ text: buffer.join('\n'), startLine: start, endLine: i - 1 })
      }
      start = i
      buffer = [line]
    } else if (start >= 0) {
      buffer.push(line)
    }
  }
  if (start >= 0) {
    entries.push({ text: buffer.join('\n'), startLine: start, endLine: lines.length - 1 })
  }
  return entries
}

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

function checkBalance(
  postings: readonly Posting[],
  headerOffset: number,
  diagnostics: Diagnostic[],
): void {
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
  if (elided > 0) return
  const unbalanced = [...sums].filter(([, v]) => Math.abs(v) > 1e-9)
  if (unbalanced.length > 0) {
    const detail = unbalanced
      .map(([c, v]) => `${c}=${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2)}`)
      .join(', ')
    diagnostics.push({
      kind: 'rule-violation',
      lineOffset: headerOffset,
      message: `Unbalanced transaction: ${detail}.`,
    })
  }
}

const ACCOUNT_SEGMENT = /^[A-Z][A-Za-z0-9-]*$/

function checkAccountSegments(
  postings: readonly Posting[],
  headerOffset: number,
  diagnostics: Diagnostic[],
): void {
  for (const p of postings) {
    const parts = p.account.split(':')
    const bad = parts.find((seg) => !ACCOUNT_SEGMENT.test(seg))
    if (bad !== undefined) {
      diagnostics.push({
        kind: 'rule-violation',
        lineOffset: headerOffset,
        message: `Invalid account segment '${bad}' in '${p.account}'; segments must match [A-Z][A-Za-z0-9-]*.`,
      })
    }
  }
}

function checkCreditCardShape(
  postings: readonly Posting[],
  headerOffset: number,
  diagnostics: Diagnostic[],
): void {
  for (const p of postings) {
    const parts = p.account.split(':').filter(Boolean)
    if (parts[0] !== 'Liabilities' || !parts[1] || !CREDIT_CARD_GROUPS.has(parts[1])) continue
    if (parts.length !== 4) {
      diagnostics.push({
        kind: 'rule-violation',
        lineOffset: headerOffset,
        message: `Credit card account must be 'Liabilities:${parts[1]}:bank:card'; got '${p.account}'.`,
      })
    }
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

function findHeader(source: string): { line: string; offset: number } | null {
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (DATE_LED.test(lines[i])) return { line: lines[i], offset: i }
  }
  return null
}

export function validateTxn(source: string): ValidationResult {
  const r = extractTxn(source)
  if (r.ok !== true) return { ok: false, diagnostics: r.diagnostics }
  return { ok: true }
}

export function extractTxn(source: string): ExtractResult {
  const trimmed = source.trim()
  if (!trimmed) {
    return {
      ok: false,
      diagnostics: [{ kind: 'rule-violation', lineOffset: 0, message: 'Empty input.' }],
    }
  }

  const diagnostics: Diagnostic[] = []
  const header = findHeader(trimmed)
  const headerOffset = header?.offset ?? 0

  let result
  try {
    result = parse(trimmed)
  } catch (err) {
    const message =
      err instanceof BeancountParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err)
    diagnostics.push({ kind: 'rule-violation', lineOffset: headerOffset, message })
    return { ok: false, diagnostics }
  }

  const t = result.transactions[0]
  if (t == null) {
    diagnostics.push({
      kind: 'parser-unparseable',
      lineOffset: headerOffset,
      message: 'Not a transaction.',
    })
    return { ok: false, diagnostics }
  }

  if (normalizeFlag(t.flag) === 'invalid') {
    diagnostics.push({
      kind: 'rule-violation',
      lineOffset: headerOffset,
      message: `Flag must be '*' or '!'; got '${t.flag}'.`,
    })
  }
  if (t.date.year < 1900) {
    diagnostics.push({
      kind: 'rule-violation',
      lineOffset: headerOffset,
      message: `Date year must be >= 1900; got ${t.date.year}.`,
    })
  }
  checkAccountSegments(t.postings, headerOffset, diagnostics)
  checkBalance(t.postings, headerOffset, diagnostics)
  checkCreditCardShape(t.postings, headerOffset, diagnostics)

  if (diagnostics.length > 0) return { ok: false, diagnostics }
  return { ok: true, value: extractFields(t) }
}
