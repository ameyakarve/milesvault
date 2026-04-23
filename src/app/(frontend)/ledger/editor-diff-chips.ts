import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { CATEGORY_ICON_SVG, toChipSvg } from '@/lib/beancount/category-icon-svgs'
import {
  ANY_ACCOUNT_RE,
  chipVisualWidth,
  matchAccountChip,
  matchExpenseChip,
} from '@/lib/beancount/glyphs'
import { ACCOUNT_GLYPH_SVG } from './editor-account-glyphs'
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
    if (acct.startsWith('Expenses:')) {
      const hit = matchExpenseChip(acct)
      if (!hit) continue
      const svg = CATEGORY_ICON_SVG[hit.matchedPath]
      if (!svg) continue
      out.push({
        from,
        to: from + hit.consumedLen,
        label: hit.chipLabel,
        svg,
        title: acct.slice(0, hit.consumedLen),
      })
    } else {
      const hit = matchAccountChip(acct)
      if (!hit) continue
      const svg = ACCOUNT_GLYPH_SVG[hit.glyph.text]
      if (!svg) continue
      out.push({
        from,
        to: from + hit.consumedLen,
        label: hit.chipLabel,
        svg,
        title: acct.slice(0, hit.consumedLen),
      })
    }
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

function chipifyDelElement(del: HTMLElement): void {
  const text = del.textContent ?? ''
  const specs = buildChipSpecs(text)
  if (specs.length === 0) return
  del.replaceChildren()
  let cursor = 0
  for (const s of specs) {
    if (s.from > cursor) {
      del.appendChild(document.createTextNode(text.slice(cursor, s.from)))
    }
    del.appendChild(makeChipSpan(s))
    cursor = s.to
  }
  if (cursor < text.length) {
    del.appendChild(document.createTextNode(text.slice(cursor)))
  }
}

function chipifyChunk(chunk: HTMLElement): void {
  if (chunk.dataset.chipified === '1') return
  const dels = chunk.querySelectorAll<HTMLElement>('.cm-deletedLine > del')
  for (const del of dels) chipifyDelElement(del)
  chunk.dataset.chipified = '1'
}

export const diffChips = ViewPlugin.fromClass(
  class {
    view: EditorView
    constructor(view: EditorView) {
      this.view = view
      queueMicrotask(() => this.process())
    }
    update(_u: ViewUpdate) {
      queueMicrotask(() => this.process())
    }
    process() {
      const chunks = this.view.contentDOM.querySelectorAll<HTMLElement>('.cm-deletedChunk')
      for (const c of chunks) chipifyChunk(c)
    }
  },
)
