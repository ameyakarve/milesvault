import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { RangeSetBuilder, StateEffect, StateField, type EditorState } from '@codemirror/state'
import type { DirectiveInput, TransactionInput } from '@/durable/ledger-types'
import type { ParsedEntry } from '@/lib/beancount/ast'

export type CardSpec = {
  startLine: number
  endLine: number
  balance: string | null
  mismatch: boolean
}

function postingDelta(
  txn: TransactionInput,
  account: string,
  currency: string,
): number {
  let sum = 0
  for (const p of txn.postings) {
    if (p.account === account && p.currency === currency && p.amount != null) {
      const v = Number(p.amount)
      if (!Number.isNaN(v)) sum += v
    }
  }
  return sum
}

function formatBalance(n: number, currency: string): string {
  const fixed = n.toFixed(2)
  const [int, frac] = fixed.split('.')
  const sign = int!.startsWith('-') ? '-' : ''
  const digits = sign ? int!.slice(1) : int!
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${withCommas}.${frac} ${currency}`
}

export function computeCardSpecs(
  transactions: TransactionInput[],
  directives: DirectiveInput[],
  entries: ParsedEntry[],
  account: string,
  currency: string,
): CardSpec[] {
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
        mismatch: false,
      })
    } else {
      const d = directives[e.index]
      if (!d) continue
      if (d.kind === 'open') {
        running = 0
        specs.push({
          ...e.range,
          balance: formatBalance(running, currency),
          mismatch: false,
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
          mismatch,
        })
      } else if (d.kind === 'pad' || d.kind === 'close') {
        specs.push({
          ...e.range,
          balance: formatBalance(running, currency),
          mismatch: false,
        })
      } else {
        specs.push({ ...e.range, balance: null, mismatch: false })
      }
    }
  }
  return specs
}

export const setCardSpecs = StateEffect.define<CardSpec[]>()

class BalancePillWidget extends WidgetType {
  constructor(
    private readonly value: string,
    private readonly mismatch: boolean,
  ) {
    super()
  }
  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = `cm-balance-pill${this.mismatch ? ' cm-balance-mismatch' : ''}`
    const inner = document.createElement('span')
    const label = document.createElement('span')
    label.className = 'cm-bal-label'
    label.textContent = 'bal '
    const value = document.createElement('span')
    value.textContent = this.value
    inner.appendChild(label)
    inner.appendChild(value)
    wrap.appendChild(inner)
    return wrap
  }
  eq(other: BalancePillWidget) {
    return other.value === this.value && other.mismatch === this.mismatch
  }
  ignoreEvent() {
    return true
  }
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
    if (spec.balance != null) {
      const lastLine = state.doc.line(endLine)
      items.push({
        from: lastLine.to,
        to: lastLine.to,
        deco: Decoration.widget({
          widget: new BalancePillWidget(spec.balance, spec.mismatch),
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
