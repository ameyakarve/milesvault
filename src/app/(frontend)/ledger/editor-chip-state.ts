import type { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { cachedParse } from './parse-cache'

function activeEntryRange(state: EditorState): { from: number; to: number } | null {
  const cursor = state.selection.main.head
  for (const e of cachedParse(state.doc).entries) {
    if (cursor >= e.range.from && cursor <= e.range.to) {
      return { from: e.range.from, to: e.range.to }
    }
  }
  return null
}

export type ChipSuppressContext = {
  cursor: number
  active: { from: number; to: number } | null
}

export function chipSuppressContext(state: EditorState): ChipSuppressContext {
  return { cursor: state.selection.main.head, active: activeEntryRange(state) }
}

export function isChipSuppressed(
  ctx: ChipSuppressContext,
  range: { from: number; to: number },
): boolean {
  if (ctx.cursor >= range.from && ctx.cursor <= range.to) return true
  if (ctx.active && range.from >= ctx.active.from && range.to <= ctx.active.to) return true
  return false
}

export function unveilChipAt(view: EditorView, from: number): void {
  view.dispatch({ selection: { anchor: from } })
}
