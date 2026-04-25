import type { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { cachedParse } from './parse-cache'

export function cursorPos(state: EditorState): number {
  return state.selection.main.head
}

export function activeEntryRange(state: EditorState): { from: number; to: number } | null {
  const cursor = state.selection.main.head
  for (const e of cachedParse(state.doc).entries) {
    if (cursor >= e.range.from && cursor <= e.range.to) {
      return { from: e.range.from, to: e.range.to }
    }
  }
  return null
}

export function unveilChipAt(view: EditorView, from: number): void {
  view.dispatch({ selection: { anchor: from } })
}
