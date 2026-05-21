'use client'

import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import {
  HighlightStyle,
  LRLanguage,
  LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language'
import { unifiedMergeView } from '@codemirror/merge'
import { styleTags, tags as t } from '@lezer/highlight'
import { parser as beancountParser } from 'lezer-beancount'
import type { ProposeJournalEditResult } from '@/durable/agent-ui-schemas'
import { useChatActions } from '../chat-actions'

const beancountLang = LRLanguage.define({
  parser: beancountParser.configure({
    props: [
      styleTags({
        Date: t.literal,
        TxnFlag: t.operator,
        String: t.string,
        Account: t.variableName,
        Number: t.number,
        Currency: t.unit,
      }),
    ],
  }),
})

const SYNTAX = HighlightStyle.define([
  { tag: t.literal, color: '#00685f' },
  { tag: t.operator, color: '#191c1e', fontWeight: '700' },
  { tag: t.string, color: '#57657a' },
  { tag: t.variableName, color: '#191c1e' },
  { tag: t.number, color: '#3d4947', fontWeight: '700' },
  { tag: t.unit, color: '#515f74' },
])

const THEME = EditorView.theme({
  '&': {
    backgroundColor: '#fff',
    fontSize: '12px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.55' },
  '.cm-content': { padding: '8px 0' },
  '.cm-gutters': { backgroundColor: '#f8fafc', borderRight: '1px solid #e2e8f0' },
  '.cm-deletedChunk': { backgroundColor: 'rgba(244, 63, 94, 0.08)' },
  '.cm-changedLine': { backgroundColor: 'rgba(20, 184, 166, 0.08)' },
  '.cm-changedText': { backgroundColor: 'rgba(20, 184, 166, 0.18)' },
})

export function DiffCard({ input }: { input: ProposeJournalEditResult }) {
  const { sendMessage, busy } = useChatActions()
  const [text, setText] = useState(input.proposed_text)
  const [submitted, setSubmitted] = useState<null | 'approved' | 'rejected'>(null)

  const extensions = useMemo(
    () => [
      new LanguageSupport(beancountLang),
      syntaxHighlighting(SYNTAX),
      THEME,
      unifiedMergeView({
        original: input.before_text,
        highlightChanges: true,
        gutter: true,
        mergeControls: false,
      }),
    ],
    [input.before_text],
  )

  const summary = input.summary
  const noChanges =
    summary.insert === 0 && summary.delete === 0

  function onApprove() {
    if (submitted || busy) return
    setSubmitted('approved')
    const edited = text !== input.proposed_text
    const body = edited
      ? `Approved proposal \`${input.proposal_id}\`. Use commit_journal_edit with this edited text:\n\n\`\`\`beancount\n${text}\n\`\`\``
      : `Approved proposal \`${input.proposal_id}\`. Use commit_journal_edit with no edits.`
    void sendMessage({ text: body })
  }

  function onReject() {
    if (submitted || busy) return
    setSubmitted('rejected')
    void sendMessage({
      text: `Rejected proposal \`${input.proposal_id}\`. Do not commit it.`,
    })
  }

  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">
          Proposed edit
        </div>
        <div className="mt-0.5 text-sm font-medium text-slate-900">
          {input.instruction}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Chip color="teal" label={`+${summary.insert} inserted`} />
          <Chip color="rose" label={`-${summary.delete} deleted`} />
          <Chip color="slate" label={`${summary.unchanged} unchanged`} />
          {noChanges && (
            <span className="text-[11px] text-slate-500">
              (no net journal change — the proposed text matches what's there)
            </span>
          )}
        </div>
      </div>

      <div className="border-b border-slate-100">
        <CodeMirror
          value={text}
          onChange={setText}
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            foldGutter: false,
            autocompletion: false,
          }}
          editable={!submitted}
        />
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-3">
        {submitted === 'approved' && (
          <span className="text-xs text-teal-700">Approved — awaiting commit…</span>
        )}
        {submitted === 'rejected' && (
          <span className="text-xs text-slate-500">Rejected.</span>
        )}
        {!submitted && (
          <>
            <button
              type="button"
              onClick={onReject}
              disabled={busy}
              className="rounded-[8px] border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-40"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="rounded-[8px] bg-teal-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-teal-600 disabled:opacity-40"
            >
              Approve
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Chip({
  color,
  label,
}: {
  color: 'teal' | 'rose' | 'slate'
  label: string
}) {
  const cls =
    color === 'teal'
      ? 'bg-teal-50 text-teal-700 border-teal-200'
      : color === 'rose'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] tabular-nums ${cls}`}
    >
      {label}
    </span>
  )
}
