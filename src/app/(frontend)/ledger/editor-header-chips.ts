import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { Circle, CircleCheck, Quote, TriangleAlert, User } from 'lucide-static'
import { chipSlotWidth, toChipSvg } from '@/lib/beancount/entities'
import { cursorTxnLines, unveilChipAt } from './editor-chip-state'

export type HeaderHit = {
  from: number
  to: number
  label: string
  tooltip: string
  svg?: string
  flagClass?: string
}

const HEADER_RE =
  /^(\d{4}-\d{2}-\d{2})([ \t]+)([*!]|txn)([ \t]+)"([^"]*)"(?:([ \t]+)"([^"]*)")?/gm

const FLAG_META: Record<string, { label: string; svg: string; flagClass: string }> = {
  '*': { label: '', svg: CircleCheck, flagClass: 'cm-flag-chip-cleared' },
  '!': { label: 'Pending', svg: TriangleAlert, flagClass: 'cm-flag-chip-pending' },
  txn: { label: 'Entry', svg: Circle, flagClass: 'cm-flag-chip-txn' },
}

function dateChipLabel(iso: string, todayMs: number): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const diffDays = Math.round((todayMs - d.getTime()) / 86_400_000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays > 1 && diffDays <= 7) return `${diffDays}d ago`
  if (diffDays === -1) return 'tomorrow'
  if (diffDays < 0 && diffDays >= -7) return `in ${-diffDays}d`
  return `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`
}

export function hitsForLine(lineText: string, lineFrom: number, todayMs: number): HeaderHit[] {
  const hits: HeaderHit[] = []
  HEADER_RE.lastIndex = 0
  const match = HEADER_RE.exec(lineText)
  if (!match) return hits
  const [, dateStr, sp1, flag, sp2, payee, sp3, narration] = match
  const base = lineFrom + (match.index ?? 0)
  hits.push({
    from: base,
    to: base + dateStr.length,
    label: dateChipLabel(dateStr, todayMs),
    tooltip: dateStr,
  })
  const flagFrom = base + dateStr.length + sp1.length
  const flagMeta = FLAG_META[flag]
  if (flagMeta) {
    hits.push({
      from: flagFrom,
      to: flagFrom + flag.length,
      label: flagMeta.label,
      tooltip: `flag: ${flag}`,
      svg: flagMeta.svg,
      flagClass: flagMeta.flagClass,
    })
  }
  const payeeOpenQuote = flagFrom + flag.length + sp2.length
  const payeeLen = payee.length + 2
  hits.push({
    from: payeeOpenQuote,
    to: payeeOpenQuote + payeeLen,
    label: payee || 'payee',
    tooltip: `payee: ${payee}`,
    svg: User,
  })
  if (narration !== undefined) {
    const narrationOpen = payeeOpenQuote + payeeLen + sp3.length
    const narrationLen = narration.length + 2
    hits.push({
      from: narrationOpen,
      to: narrationOpen + narrationLen,
      label: narration || 'narration',
      tooltip: `narration: ${narration}`,
      svg: Quote,
    })
  }
  return hits
}

export function startOfDayMs(): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.getTime()
}

function findHeaderHits(view: EditorView): HeaderHit[] {
  const hits: HeaderHit[] = []
  const todayMs = startOfDayMs()
  const doc = view.state.doc
  for (const { from, to } of view.visibleRanges) {
    let lineNum = doc.lineAt(from).number
    const endLineNum = doc.lineAt(to).number
    while (lineNum <= endLineNum) {
      const line = doc.line(lineNum)
      hits.push(...hitsForLine(line.text, line.from, todayMs))
      lineNum += 1
    }
  }
  return hits
}

function headerHitAt(view: EditorView, pos: number): HeaderHit | null {
  const line = view.state.doc.lineAt(pos)
  const hits = hitsForLine(line.text, line.from, startOfDayMs())
  return hits.find((h) => pos >= h.from && pos < h.to) ?? null
}

class HeaderChipWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly tooltip: string,
    readonly svg: string | undefined,
    readonly width: number,
    readonly flagClass: string | undefined,
  ) {
    super()
  }
  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = this.flagClass ? `cm-account-glyph ${this.flagClass}` : 'cm-account-glyph'
    span.style.width = `${this.width}ch`
    span.setAttribute('aria-label', this.tooltip)
    if (this.svg) span.innerHTML = toChipSvg(this.svg)
    if (this.label) {
      const label = document.createElement('span')
      label.className = 'cm-account-glyph-chip'
      label.textContent = this.label
      span.appendChild(label)
    }
    span.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const pos = view.posAtDOM(span)
      unveilChipAt(view, pos)
    })
    return span
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof HeaderChipWidget &&
      other.label === this.label &&
      other.tooltip === this.tooltip &&
      other.svg === this.svg &&
      other.width === this.width &&
      other.flagClass === this.flagClass
    )
  }
  ignoreEvent(): boolean {
    return false
  }
}

function buildHeaderDecorations(view: EditorView): DecorationSet {
  const active = cursorTxnLines(view.state)
  const doc = view.state.doc
  const hits = findHeaderHits(view).sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const h of hits) {
    const ln = doc.lineAt(h.from).number
    if (ln >= active.from && ln <= active.to) continue
    builder.add(
      h.from,
      h.to,
      Decoration.replace({
        widget: new HeaderChipWidget(
          h.label,
          h.tooltip,
          h.svg,
          chipSlotWidth(h.to - h.from, h.label),
          h.flagClass,
        ),
      }),
    )
  }
  return builder.finish()
}

export const headerChips = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildHeaderDecorations(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildHeaderDecorations(u.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations ?? Decoration.none
      }),
  },
)

export const headerChipTooltip = hoverTooltip(
  (view, pos) => {
    const hit = headerHitAt(view, pos)
    if (!hit) return null
    return {
      pos: hit.from,
      end: hit.to,
      above: true,
      create: () => {
        const dom = document.createElement('div')
        dom.className = 'cm-account-glyph-tip'
        dom.textContent = hit.tooltip
        return { dom }
      },
    }
  },
  { hoverTime: 120 },
)
