import { StateEffect, StateField } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export const unveilChip = StateEffect.define<number>()
export const rechipAll = StateEffect.define<null>()

export const unveiledChipsField = StateField.define<Set<number>>({
  create: () => new Set(),
  update(set, tr) {
    let next = set
    if (tr.docChanged) {
      const mapped = new Set<number>()
      for (const p of set) mapped.add(tr.changes.mapPos(p, -1))
      next = mapped
    }
    for (const e of tr.effects) {
      if (e.is(unveilChip)) {
        next = new Set(next)
        next.add(e.value)
      } else if (e.is(rechipAll)) {
        if (next.size > 0) next = new Set()
      }
    }
    if (next.size > 0 && (tr.selection || tr.docChanged)) {
      const doc = tr.state.doc
      const cursorLine = doc.lineAt(tr.state.selection.main.head).number
      const filtered = new Set<number>()
      for (const p of next) {
        if (p < 0 || p > doc.length) continue
        if (doc.lineAt(p).number === cursorLine) filtered.add(p)
      }
      if (filtered.size !== next.size) next = filtered
    }
    return next
  },
})

export function unveilChipAt(view: EditorView, from: number): void {
  view.dispatch({
    effects: unveilChip.of(from),
    selection: { anchor: from },
  })
}

export const chipBlurHandler = EditorView.domEventHandlers({
  blur(_event, view) {
    if ((view.state.field(unveiledChipsField, false)?.size ?? 0) > 0) {
      view.dispatch({ effects: rechipAll.of(null) })
    }
    return false
  },
})
