import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { RangeSetBuilder, StateEffect, StateField, type EditorState } from '@codemirror/state'
import type { DirectiveInput, TransactionInput } from '@/durable/ledger-types'
import type { ParsedEntry } from '@/lib/beancount/ast'
import { accountMatchesPrefix } from '@/lib/beancount/scope'

export type DeltaSpec = {
  line: number
  sign: '+' | '−'
  value: string
  flow: 'in' | 'out'
  amountRaw: string
  currencyRaw: string
}

export type CardSpec = {
  startLine: number
  endLine: number
  balance: string | null
  runningTotal: number | null
  mismatch: boolean
  deltas: DeltaSpec[]
}

const CURRENCY_META: Record<string, { symbol: string; locale: string }> = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
}

function formatGrouped(absN: number, currency: string): string {
  const meta = CURRENCY_META[currency]
  return new Intl.NumberFormat(meta?.locale ?? 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absN)
}

export function formatHeaderBalance(n: number, currency: string): string {
  const meta = CURRENCY_META[currency]
  const grouped = formatGrouped(Math.abs(n), currency)
  const sign = n < 0 ? '-' : ''
  if (meta) return `${sign}${meta.symbol}${grouped}`
  return `${sign}${grouped} ${currency}`
}

function postingDelta(
  txn: TransactionInput,
  account: string,
  currency: string,
): number {
  let sum = 0
  for (const p of txn.postings) {
    if (
      accountMatchesPrefix(p.account, account) &&
      p.currency === currency &&
      p.amount != null
    ) {
      const v = Number(p.amount)
      if (!Number.isNaN(v)) sum += v
    }
  }
  return sum
}

function formatBalance(n: number, currency: string): string {
  const meta = CURRENCY_META[currency]
  const grouped = formatGrouped(Math.abs(n), currency)
  const sign = n < 0 ? '-' : ''
  if (meta) return `${sign}${grouped}`
  return `${sign}${grouped} ${currency}`
}

function formatDeltaValue(absN: number, currency: string): string {
  return formatGrouped(absN, currency)
}

function txnDeltas(
  txn: TransactionInput,
  account: string,
  currency: string,
  startLine: number,
): DeltaSpec[] {
  const out: DeltaSpec[] = []
  for (let i = 0; i < txn.postings.length; i++) {
    const p = txn.postings[i]!
    if (
      !accountMatchesPrefix(p.account, account) ||
      p.currency !== currency ||
      p.amount == null
    ) {
      continue
    }
    const v = Number(p.amount)
    if (Number.isNaN(v) || v === 0) continue
    out.push({
      line: startLine + 1 + i,
      sign: v < 0 ? '−' : '+',
      value: formatDeltaValue(Math.abs(v), currency),
      flow: v < 0 ? 'out' : 'in',
      amountRaw: p.amount,
      currencyRaw: p.currency!,
    })
  }
  return out
}

export function computeCardSpecs(
  transactions: TransactionInput[],
  directives: DirectiveInput[],
  entries: ParsedEntry[],
  account: string,
  currency: string,
  options: { descending?: boolean } = {},
): CardSpec[] {
  if (options.descending) {
    return computeCardSpecsDesc(transactions, directives, entries, account, currency)
  }
  let running = 0
  const specs: CardSpec[] = []
  for (const e of entries) {
    if (e.kind === 'transaction') {
      const tx = transactions[e.index]
      if (!tx) continue
      running += postingDelta(tx, account, currency)
      specs.push({
        ...e.range,
        balance: formatBalance(running, currency),
        runningTotal: running,
        mismatch: false,
        deltas: txnDeltas(tx, account, currency, e.range.startLine),
      })
    } else {
      const d = directives[e.index]
      if (!d) continue
      if (d.kind === 'open') {
        running = 0
        specs.push({
          ...e.range,
          balance: formatBalance(running, currency),
          runningTotal: running,
          mismatch: false,
          deltas: [],
        })
      } else if (d.kind === 'balance') {
        const expected = Number(d.amount)
        const mismatch =
          d.currency === currency &&
          !Number.isNaN(expected) &&
          Math.abs(expected - running) > 0.005
        specs.push({
          ...e.range,
          balance: formatBalance(running, currency),
          runningTotal: running,
          mismatch,
          deltas: [],
        })
      } else if (d.kind === 'pad' || d.kind === 'close') {
        specs.push({
          ...e.range,
          balance: formatBalance(running, currency),
          runningTotal: running,
          mismatch: false,
          deltas: [],
        })
      } else {
        specs.push({
          ...e.range,
          balance: null,
          runningTotal: null,
          mismatch: false,
          deltas: [],
        })
      }
    }
  }
  return specs
}

// Descending mode: entries arrive in reverse-chronological display order.
// Compute the total account balance over ALL transactions (regardless of
// whether they appear before/after balance directives), then walk top-down
// decrementing each upcoming delta from that total. The balance shown on
// each card is the running balance AFTER that txn's effect — same value
// the chronological pass would produce.
function computeCardSpecsDesc(
  transactions: TransactionInput[],
  directives: DirectiveInput[],
  entries: ParsedEntry[],
  account: string,
  currency: string,
): CardSpec[] {
  let accountBalance = 0
  for (const tx of transactions) accountBalance += postingDelta(tx, account, currency)

  const specs: CardSpec[] = []
  let upcomingDeltas = 0
  for (const e of entries) {
    if (e.kind === 'transaction') {
      const tx = transactions[e.index]
      if (!tx) continue
      const after = accountBalance - upcomingDeltas
      specs.push({
        ...e.range,
        balance: formatBalance(after, currency),
        runningTotal: after,
        mismatch: false,
        deltas: txnDeltas(tx, account, currency, e.range.startLine),
      })
      upcomingDeltas += postingDelta(tx, account, currency)
    } else {
      const d = directives[e.index]
      if (!d) continue
      if (d.kind === 'open') {
        // Open directive resets running to 0 chronologically; in descending
        // display it's the bottom-most card with a zero balance.
        specs.push({
          ...e.range,
          balance: formatBalance(0, currency),
          runningTotal: 0,
          mismatch: false,
          deltas: [],
        })
      } else if (d.kind === 'balance') {
        const after = accountBalance - upcomingDeltas
        const expected = Number(d.amount)
        const mismatch =
          d.currency === currency &&
          !Number.isNaN(expected) &&
          Math.abs(expected - after) > 0.005
        specs.push({
          ...e.range,
          balance: formatBalance(after, currency),
          runningTotal: after,
          mismatch,
          deltas: [],
        })
      } else if (d.kind === 'pad' || d.kind === 'close') {
        const after = accountBalance - upcomingDeltas
        specs.push({
          ...e.range,
          balance: formatBalance(after, currency),
          runningTotal: after,
          mismatch: false,
          deltas: [],
        })
      } else {
        specs.push({
          ...e.range,
          balance: null,
          runningTotal: null,
          mismatch: false,
          deltas: [],
        })
      }
    }
  }
  return specs
}

export const setCardSpecs = StateEffect.define<CardSpec[]>()

class DeltaWidget extends WidgetType {
  constructor(private readonly d: DeltaSpec) {
    super()
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-delta-inlay'
    const inner = document.createElement('span')
    inner.className = this.d.flow === 'out' ? 'cm-delta-out' : 'cm-delta-in'
    inner.textContent = `${this.d.sign}${this.d.value}`
    el.appendChild(document.createTextNode('→ '))
    el.appendChild(inner)
    return el
  }
  eq(other: DeltaWidget) {
    return (
      this.d.sign === other.d.sign &&
      this.d.value === other.d.value &&
      this.d.flow === other.d.flow
    )
  }
  ignoreEvent() {
    return true
  }
}

class BalanceFooterWidget extends WidgetType {
  constructor(
    private readonly value: string,
    private readonly mismatch: boolean,
  ) {
    super()
  }
  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'cm-balance-footer-wrap'
    const row = document.createElement('div')
    row.className = `cm-balance-footer${this.mismatch ? ' cm-balance-mismatch' : ''}`
    const label = document.createElement('span')
    label.className = 'cm-bal-label'
    label.textContent = 'BALANCE'
    const value = document.createElement('span')
    value.className = 'cm-bal-value'
    value.textContent = this.value
    row.appendChild(label)
    row.appendChild(value)
    wrap.appendChild(row)
    return wrap
  }
  eq(other: BalanceFooterWidget) {
    return other.value === this.value && other.mismatch === this.mismatch
  }
  ignoreEvent() {
    return true
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildSet(state: EditorState, specs: CardSpec[]): DecorationSet {
  const lineCount = state.doc.lines
  type Item = { from: number; to: number; deco: Decoration; order: number }
  const items: Item[] = []
  const sorted = [...specs].sort((a, b) => a.startLine - b.startLine)
  for (const spec of sorted) {
    const { startLine, endLine } = spec
    if (startLine < 1 || endLine > lineCount || startLine > endLine) continue
    const classes: string[] =
      startLine === endLine
        ? ['cm-card-solo']
        : [
            'cm-card-top',
            ...Array.from({ length: endLine - startLine - 1 }, () => 'cm-card-mid'),
            'cm-card-bot',
          ]
    for (let i = 0; i < classes.length; i++) {
      const lineNo = startLine + i
      const from = state.doc.line(lineNo).from
      items.push({
        from,
        to: from,
        deco: Decoration.line({ class: classes[i]! }),
        order: 0,
      })
    }
    for (const d of spec.deltas) {
      if (d.line < 1 || d.line > lineCount) continue
      const lineRef = state.doc.line(d.line)
      const lineText = lineRef.text
      const pattern = new RegExp(
        `(${escapeRegex(d.amountRaw)})\\s+${escapeRegex(d.currencyRaw)}`,
      )
      const m = pattern.exec(lineText)
      if (m && m.index >= 0) {
        const amountStart = lineRef.from + m.index
        const amountEnd = amountStart + d.amountRaw.length
        items.push({
          from: amountStart,
          to: amountEnd,
          deco: Decoration.mark({
            class: d.flow === 'out' ? 'cm-amount-out' : 'cm-amount-in',
          }),
          order: 3,
        })
      }
      items.push({
        from: lineRef.to,
        to: lineRef.to,
        deco: Decoration.widget({
          widget: new DeltaWidget(d),
          side: 1,
        }),
        order: 2,
      })
    }
    if (spec.balance != null) {
      const lastLine = state.doc.line(endLine)
      items.push({
        from: lastLine.to,
        to: lastLine.to,
        deco: Decoration.widget({
          widget: new BalanceFooterWidget(spec.balance, spec.mismatch),
          side: 1,
          block: true,
        }),
        order: 1,
      })
    }
  }
  items.sort((a, b) => a.from - b.from || a.order - b.order)
  const builder = new RangeSetBuilder<Decoration>()
  for (const it of items) builder.add(it.from, it.to, it.deco)
  return builder.finish()
}

const cardField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(set, tr) {
    let next = set.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setCardSpecs)) {
        next = buildSet(tr.state, e.value)
      }
    }
    return next
  },
  provide: (f) => EditorView.decorations.from(f),
})

export function cardDecorations() {
  return [cardField]
}
