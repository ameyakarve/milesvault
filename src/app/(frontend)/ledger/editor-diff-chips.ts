import { getChunks } from '@codemirror/merge'
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { chipSlotWidth, chipVisualWidth, resolveAccount } from '@/lib/beancount/entities'
import { parseBuffer } from '@/lib/beancount/parse'
import { renderChip, type ChipSpec } from './chip-widget'
import { hitsForTxn } from './editor-header-chips'

type PositionedChip = ChipSpec & { from: number; to: number }

function buildChipSpecs(text: string): PositionedChip[] {
  const { entries, accounts } = parseBuffer(text)
  const specs: PositionedChip[] = []
  for (const txn of entries) {
    for (const h of hitsForTxn(txn)) {
      specs.push({
        from: h.from,
        to: h.to,
        variant: h.variant,
        label: h.label,
        tooltip: h.tooltip,
        svg: h.svg,
        width: chipVisualWidth(h.label, h.svg !== undefined),
      })
    }
  }
  for (const a of accounts) {
    const r = resolveAccount(a.account)
    if (!r || !r.glyph) continue
    const to = a.range.from + r.consumedLen
    const label = r.chipLabel
    specs.push({
      from: a.range.from,
      to,
      variant: 'account',
      label,
      tooltip: a.account.slice(0, r.consumedLen),
      svg: r.glyph.svg,
      width: chipSlotWidth(to - a.range.from, label),
    })
  }
  specs.sort((a, b) => a.from - b.from)
  const merged: PositionedChip[] = []
  let cursor = 0
  for (const s of specs) {
    if (s.from < cursor) continue
    merged.push(s)
    cursor = s.to
  }
  return merged
}

function rememberRaw(chunk: HTMLElement): void {
  const dels = chunk.querySelectorAll<HTMLElement>('.cm-deletedLine > del')
  for (const del of dels) {
    if (del.dataset.raw === undefined) del.dataset.raw = del.textContent ?? ''
  }
}

function renderChipped(chunk: HTMLElement): void {
  const dels = chunk.querySelectorAll<HTMLElement>('.cm-deletedLine > del')
  for (const del of dels) {
    const text = del.dataset.raw ?? del.textContent ?? ''
    const specs = buildChipSpecs(text)
    if (specs.length === 0) {
      del.textContent = text
      continue
    }
    del.replaceChildren()
    let cursor = 0
    for (const s of specs) {
      if (s.from > cursor) del.appendChild(document.createTextNode(text.slice(cursor, s.from)))
      del.appendChild(renderChip(s))
      cursor = s.to
    }
    if (cursor < text.length) del.appendChild(document.createTextNode(text.slice(cursor)))
  }
}

function renderRaw(chunk: HTMLElement): void {
  const dels = chunk.querySelectorAll<HTMLElement>('.cm-deletedLine > del')
  for (const del of dels) {
    del.textContent = del.dataset.raw ?? del.textContent ?? ''
  }
}

export const diffChips = ViewPlugin.fromClass(
  class {
    view: EditorView
    constructor(view: EditorView) {
      this.view = view
      queueMicrotask(() => this.process())
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        queueMicrotask(() => this.process())
      }
    }
    process() {
      const state = this.view.state
      const chunks = getChunks(state)?.chunks ?? []
      const cursorLineNum = state.doc.lineAt(state.selection.main.head).number
      const doms = this.view.contentDOM.querySelectorAll<HTMLElement>('.cm-deletedChunk')
      for (const dom of doms) {
        rememberRaw(dom)
        const pos = this.view.posAtDOM(dom)
        const chunk = chunks.find((c) => c.fromB === pos) ?? null
        let active = false
        if (chunk) {
          const fromLine = state.doc.lineAt(Math.min(chunk.fromB, state.doc.length)).number
          const toInc = chunk.toB > chunk.fromB ? chunk.toB - 1 : chunk.fromB
          const toLine = state.doc.lineAt(Math.min(toInc, state.doc.length)).number
          active = cursorLineNum >= fromLine && cursorLineNum <= toLine
        }
        const want: 'raw' | 'chips' = active ? 'raw' : 'chips'
        if (dom.dataset.chipMode === want) continue
        if (want === 'raw') renderRaw(dom)
        else renderChipped(dom)
        dom.dataset.chipMode = want
      }
    }
  },
)
