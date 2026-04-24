import {
  type Completion,
  type CompletionSource,
  startCompletion,
} from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'
import { openAiForCurrentSelection } from './editor-ai-widget'

type SlashCommand = {
  name: string
  label: string
  detail: string
  apply: (view: EditorView, from: number, to: number) => void
}

function txnSkeleton(): { text: string; payeeOffset: number } {
  const date = new Date().toISOString().slice(0, 10)
  return {
    text: `${date} * "" ""\n  \n  \n`,
    payeeOffset: date.length + 4,
  }
}

function applyTxn(view: EditorView, from: number, to: number) {
  const { text, payeeOffset } = txnSkeleton()
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + payeeOffset },
  })
}

function applyComment(view: EditorView, from: number, to: number) {
  const insert = '; '
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
  })
}

function applyAi(view: EditorView, from: number, to: number) {
  view.dispatch({ changes: { from, to, insert: '' } })
  openAiForCurrentSelection(view)
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'txn',
    label: '/txn',
    detail: 'Insert transaction skeleton with today\u2019s date',
    apply: applyTxn,
  },
  {
    name: 'comment',
    label: '/comment',
    detail: 'Insert a `;` comment line',
    apply: applyComment,
  },
  {
    name: 'ai',
    label: '/ai',
    detail: 'Edit current transaction with AI',
    apply: applyAi,
  },
]

const LINE_SLASH_RE = /^\s*\/[a-z]*$/

export const slashCompletionSource: CompletionSource = (context) => {
  const line = context.state.doc.lineAt(context.pos)
  const beforeCursor = line.text.slice(0, context.pos - line.from)
  if (!LINE_SLASH_RE.test(beforeCursor)) return null
  const slashIdx = beforeCursor.indexOf('/')
  const from = line.from + slashIdx
  const to = line.to
  const options: Completion[] = SLASH_COMMANDS.map((cmd) => ({
    label: cmd.label,
    detail: cmd.detail,
    type: 'keyword',
    apply: (view, _completion, applyFrom, applyTo) => cmd.apply(view, applyFrom, applyTo),
  }))
  return {
    from,
    to,
    options,
    validFor: /^\/[a-z]*$/,
  }
}

export const slashCompletionTrigger = EditorView.updateListener.of((u) => {
  if (!u.docChanged) return
  let typedSlash = false
  u.changes.iterChanges((_fA, _tA, _fB, _tB, inserted) => {
    if (inserted.toString() === '/') typedSlash = true
  })
  if (!typedSlash) return
  const pos = u.state.selection.main.head
  const line = u.state.doc.lineAt(pos)
  const before = line.text.slice(0, pos - line.from)
  if (!/^\s*\/$/.test(before)) return
  startCompletion(u.view)
})
