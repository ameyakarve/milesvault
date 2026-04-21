import type { StateField } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { diffWordsWithSpace } from 'diff'
import { splitEntries } from '@/lib/beancount/extract'

const createdLine = Decoration.line({ attributes: { class: 'cm-txn-created' } })
const updatedLine = Decoration.line({ attributes: { class: 'cm-txn-updated' } })
const wordAdded = Decoration.mark({ attributes: { class: 'cm-word-added' } })

type EntryClassification = {
  change: 'unchanged' | 'created' | 'updated'
  baselineText: string | null
}

function classifyDoc(doc: string, baseline: string): EntryClassification[] {
  const current = splitEntries(doc).map((e) => e.text.trim())
  const base = splitEntries(baseline).map((e) => e.text.trim())
  const baseCounts = new Map<string, number>()
  for (const b of base) baseCounts.set(b, (baseCounts.get(b) ?? 0) + 1)
  const classified: (EntryClassification | null)[] = current.map((c) => {
    const n = baseCounts.get(c) ?? 0
    if (n > 0) {
      baseCounts.set(c, n - 1)
      return { change: 'unchanged', baselineText: c }
    }
    return null
  })
  const unmatchedBase: string[] = []
  for (const b of base) {
    const n = baseCounts.get(b) ?? 0
    if (n > 0) {
      unmatchedBase.push(b)
      baseCounts.set(b, n - 1)
    }
  }
  let bi = 0
  for (let i = 0; i < classified.length; i++) {
    if (classified[i]) continue
    if (bi < unmatchedBase.length) {
      classified[i] = { change: 'updated', baselineText: unmatchedBase[bi++] }
    } else {
      classified[i] = { change: 'created', baselineText: null }
    }
  }
  return classified as EntryClassification[]
}

export function diffHighlightExtension(baselineField: StateField<string>) {
  function build(view: EditorView): DecorationSet {
    const doc = view.state.doc
    const baseline = view.state.field(baselineField)
    if (!baseline) return Decoration.none
    const docText = doc.toString()
    const entries = splitEntries(docText)
    const metas = classifyDoc(docText, baseline)
    const ranges: ReturnType<Decoration['range']>[] = []
    for (let i = 0; i < entries.length; i++) {
      const meta = metas[i]
      if (!meta || meta.change === 'unchanged') continue
      const entry = entries[i]
      const lineDeco = meta.change === 'created' ? createdLine : updatedLine
      for (let ln = entry.startLine + 1; ln <= entry.endLine + 1; ln++) {
        const pos = doc.line(ln).from
        ranges.push(lineDeco.range(pos, pos))
      }
      if (meta.change === 'updated' && meta.baselineText) {
        const entryStart = doc.line(entry.startLine + 1).from
        const parts = diffWordsWithSpace(meta.baselineText, entry.text)
        let cursor = 0
        for (const p of parts) {
          if (p.removed) continue
          const len = p.value.length
          if (p.added && p.value.trim().length > 0) {
            ranges.push(wordAdded.range(entryStart + cursor, entryStart + cursor + len))
          }
          cursor += len
        }
      }
    }
    return Decoration.set(ranges, true)
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }
      update(u: ViewUpdate) {
        const prev = u.startState.field(baselineField)
        const cur = u.state.field(baselineField)
        if (u.docChanged || prev !== cur) this.decorations = build(u.view)
      }
    },
    { decorations: (v) => v.decorations },
  )
}
