import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view'
import { makeChipPlugin } from './parse-cache'

const MIN_RUN = 3

const leaderMark = Decoration.mark({ class: 'cm-leader-dots' })

function buildLeaders(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    let i = 0
    while (i < text.length) {
      if (text[i] === ' ') {
        const start = i
        while (i < text.length && text[i] === ' ') i++
        const len = i - start
        if (len >= MIN_RUN) {
          const ch = text[start - 1]
          if (ch !== undefined && ch !== '\n') {
            builder.add(from + start, from + i, leaderMark)
          }
        }
      } else if (text[i] === '\n') {
        i++
      } else {
        i++
      }
    }
  }
  return builder.finish()
}

export const leaderDots = makeChipPlugin(buildLeaders)
