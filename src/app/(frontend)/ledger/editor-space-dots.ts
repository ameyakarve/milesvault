import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'

const SPACE_RUN = / +/g

const spaceMark = Decoration.mark({ class: 'cm-space-dots' })

function buildSpaceDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  for (const { from, to } of view.visibleRanges) {
    let lineNum = doc.lineAt(from).number
    const endLineNum = doc.lineAt(to).number
    while (lineNum <= endLineNum) {
      const line = doc.line(lineNum)
      for (const m of line.text.matchAll(SPACE_RUN)) {
        const idx = m.index ?? 0
        builder.add(line.from + idx, line.from + idx + m[0].length, spaceMark)
      }
      lineNum += 1
    }
  }
  return builder.finish()
}

export const spaceDots = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildSpaceDecorations(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildSpaceDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
