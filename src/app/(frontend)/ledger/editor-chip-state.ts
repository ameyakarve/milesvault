import type { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export function cursorPos(state: EditorState): number {
  return state.selection.main.head
}

export function unveilChipAt(view: EditorView, from: number): void {
  view.dispatch({ selection: { anchor: from } })
}
