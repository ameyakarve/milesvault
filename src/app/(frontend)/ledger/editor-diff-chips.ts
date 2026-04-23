import { getChunks } from '@codemirror/merge'
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import {
  ANY_ACCOUNT_RE,
  chipVisualWidth,
  resolveAccount,
  toChipSvg,
} from '@/lib/beancount/entities'
import { hitsForLine, startOfDayMs } from './editor-header-chips'

type ChipSpec = {
  from: number
  to: number
  label: string
  svg: string
  title: string
}

function accountSpecs(text: string): ChipSpec[] {
  const out: ChipSpec[] = []
  for (const m of text.matchAll(ANY_ACCOUNT_RE)) {
    const acct = m[0]
    const from = m.index ?? 0
    const r = resolveAccount(acct)
    if (!r || !r.glyph) continue
    out.push({
      from,
      to: from + r.consumedLen,
      label: r.chipLabel,
      svg: r.glyph.svg,
      title: acct.slice(0, r.consumedLen),
    })
  }
  return out
}

function buildChipSpecs(text: string): ChipSpec[] {
  const specs: ChipSpec[] = []
  for (const h of hitsForLine(text, 0, startOfDayMs())) {
    specs.push({ from: h.from, to: h.to, label: h.label, svg: h.svg, title: h.tooltip })
  }
  for (const s of accountSpecs(text)) specs.push(s)
  specs.sort((a, b) => a.from - b.from)
  const merged: ChipSpec[] = []
  let cursor = 0
  for (const s of specs) {
    if (s.from < cursor) continue
    merged.push(s)
    cursor = s.to
  }
  return merged
}

function makeChipSpan(spec: ChipSpec): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'cm-account-glyph'
  span.style.width = `${chipVisualWidth(spec.label)}ch`
  span.setAttribute('aria-label', spec.title)
  span.innerHTML = toChipSvg(spec.svg)
  const lbl = document.createElement('span')
  lbl.className = 'cm-account-glyph-chip'
  lbl.textContent = spec.label
  span.appendChild(lbl)
  return span
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
      del.appendChild(makeChipSpan(s))
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
