import type { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export function cursorLine(state: EditorState): number {
  return state.doc.lineAt(state.selection.main.head).number
}

export function unveilChipAt(view: EditorView, from: number): void {
  view.dispatch({ selection: { anchor: from } })
}
