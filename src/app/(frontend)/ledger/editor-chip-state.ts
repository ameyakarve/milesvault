import type { EditorState, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { splitEntries } from '@/lib/beancount/extract'

const splitCache = new WeakMap<Text, ReturnType<typeof splitEntries>>()

function cachedSplit(doc: Text): ReturnType<typeof splitEntries> {
  let hit = splitCache.get(doc)
  if (!hit) {
    hit = splitEntries(doc.toString())
    splitCache.set(doc, hit)
  }
  return hit
}

export function cursorTxnLines(state: EditorState): { from: number; to: number } {
  const doc = state.doc
  const cursorLine0 = doc.lineAt(state.selection.main.head).number - 1
  const hit = cachedSplit(doc).find(
    (e) => cursorLine0 >= e.startLine && cursorLine0 <= e.endLine,
  )
  if (!hit) return { from: cursorLine0 + 1, to: cursorLine0 + 1 }
  return { from: hit.startLine + 1, to: hit.endLine + 1 }
}

export function unveilChipAt(view: EditorView, from: number): void {
  view.dispatch({ selection: { anchor: from } })
}
