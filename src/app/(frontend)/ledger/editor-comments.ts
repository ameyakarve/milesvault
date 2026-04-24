import { RangeSetBuilder, StateField, type Text } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'

const commentLine = Decoration.line({ attributes: { class: 'cm-line-comment' } })

function buildCommentLines(doc: Text): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const total = doc.lines
  for (let n = 1; n <= total; n++) {
    const line = doc.line(n)
    const trimmed = line.text.trimStart()
    if (!trimmed.startsWith(';')) continue
    builder.add(line.from, line.from, commentLine)
  }
  return builder.finish()
}

export const commentLines = StateField.define<DecorationSet>({
  create: (state) => buildCommentLines(state.doc),
  update(value, tr) {
    return tr.docChanged ? buildCommentLines(tr.newDoc) : value
  },
  provide: (f) => EditorView.decorations.from(f),
})
