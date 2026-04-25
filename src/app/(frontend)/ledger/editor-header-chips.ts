import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  type EditorView,
} from '@codemirror/view'
import { TriangleAlert } from 'lucide-static'
import type { ParsedTxn } from '@/lib/beancount/parse'
import { ChipWidget, type ChipVariant } from './chip-widget'
import { activeEntryRange, cursorPos } from './editor-chip-state'
import {
  cachedParse,
  isInVisibleRange,
  makeChipPlugin,
  makeChipTooltip,
} from './parse-cache'

export type HeaderHit = {
  from: number
  to: number
  variant: ChipVariant
  label: string
  tooltip: string
  svg?: string
}

function dateChipLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const mmm = d.toLocaleString('en', { month: 'short' })
  const dd = String(d.getDate()).padStart(2, '0')
  return `${dd} ${mmm}`
}

export function hitsForTxn(txn: ParsedTxn): HeaderHit[] {
  const hits: HeaderHit[] = []
  hits.push({
    from: txn.dateRange.from,
    to: txn.dateRange.to,
    variant: 'date',
    label: dateChipLabel(txn.date),
    tooltip: txn.date,
  })
  if (txn.flagRange) {
    if (txn.flag === '!') {
      hits.push({
        from: txn.flagRange.from,
        to: txn.flagRange.to,
        variant: 'flag-pending',
        label: 'Pending',
        tooltip: `flag: ${txn.flag}`,
        svg: TriangleAlert,
      })
    } else if (txn.flag === '*') {
      hits.push({
        from: txn.flagRange.from,
        to: txn.flagRange.to,
        variant: 'flag-cleared',
        label: '·',
        tooltip: 'cleared',
      })
    }
  }
  if (txn.payee) {
    const payeeText = txn.payee.text
    hits.push({
      from: txn.payee.range.from,
      to: txn.payee.range.to,
      variant: 'payee',
      label: payeeText || 'payee',
      tooltip: `payee: ${payeeText}`,
    })
  }
  if (txn.narration) {
    const narrationText = txn.narration.text
    hits.push({
      from: txn.narration.range.from,
      to: txn.narration.range.to,
      variant: 'narration',
      label: narrationText || 'narration',
      tooltip: `narration: ${narrationText}`,
    })
  }
  for (const tag of txn.tags) {
    hits.push({
      from: tag.range.from,
      to: tag.range.to,
      variant: 'tag',
      label: tag.text,
      tooltip: `tag: ${tag.text}`,
    })
  }
  return hits
}

function findHeaderHits(view: EditorView): HeaderHit[] {
  const hits: HeaderHit[] = []
  const { entries } = cachedParse(view.state.doc)
  for (const txn of entries) {
    if (!isInVisibleRange(view, txn.headerRange.from)) continue
    hits.push(...hitsForTxn(txn))
  }
  return hits
}

function headerHitAt(view: EditorView, pos: number): HeaderHit | null {
  const { entries } = cachedParse(view.state.doc)
  for (const txn of entries) {
    if (pos < txn.headerRange.from || pos > txn.headerRange.to) continue
    for (const h of hitsForTxn(txn)) {
      if (pos >= h.from && pos < h.to) return h
    }
  }
  return null
}

function buildHeaderDecorations(view: EditorView): DecorationSet {
  const cursor = cursorPos(view.state)
  const active = activeEntryRange(view.state)
  const hits = findHeaderHits(view).sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const h of hits) {
    if (cursor >= h.from && cursor <= h.to) continue
    if (active && h.from >= active.from && h.to <= active.to) continue
    builder.add(
      h.from,
      h.to,
      Decoration.replace({
        widget: new ChipWidget({
          variant: h.variant,
          label: h.label,
          tooltip: h.tooltip,
          svg: h.svg,
          width: h.label.length + (h.svg ? 3 : 0),
        }),
      }),
    )
  }
  return builder.finish()
}

export const headerChips = makeChipPlugin(buildHeaderDecorations)
export const headerChipTooltip = makeChipTooltip(headerHitAt)
