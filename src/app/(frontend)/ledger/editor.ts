import {
  autocompletion,
  type CompletionSource,
  startCompletion,
} from '@codemirror/autocomplete'
import { indentLess, indentMore } from '@codemirror/commands'
import {
  LanguageSupport,
  LRLanguage,
  foldNodeProp,
  foldService,
  indentService,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint'
import {
  getOriginalDoc,
  originalDocChangeEffect,
  unifiedMergeView,
} from '@codemirror/merge'
import {
  ChangeSet,
  EditorState,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Text,
  type Transaction,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutterLineClass,
  highlightWhitespace,
  keymap,
} from '@codemirror/view'
import { parser } from 'lezer-beancount'
import { type AccountCompleter, completeAccount } from '@/lib/beancount/entities'
import { splitEntries } from '@/lib/beancount/extract'
import { cachedParse } from './parse-cache'
import {
  type ValidateContext,
  type Validator,
  coreValidators,
} from '@/lib/beancount/validators'
import { amountChips } from './editor-amount-chips'
import { accountChips, accountChipTooltip } from './editor-chips'
import { diffChips } from './editor-diff-chips'
import { headerChips, headerChipTooltip } from './editor-header-chips'
import { scandiEditorTheme, scandiHighlight } from './editor-theme'
import { txnDescriptions } from './editor-txn-descriptions'

const beancountLanguage = LRLanguage.define({
  name: 'beancount',
  parser: parser.configure({
    props: [
      foldNodeProp.add({
        PostingBlock: () => null,
        MetadataBlock: () => null,
      }),
    ],
  }),
  languageData: { commentTokens: { line: ';' } },
})

const beancountSupport = new LanguageSupport(beancountLanguage, [
  syntaxHighlighting(scandiHighlight),
])

const INDENT = '  '

const beancountIndentService = indentService.of((ctx, pos) => {
  const line = ctx.state.doc.lineAt(pos)
  for (let n = line.number - 1; n >= 1; n--) {
    const prev = ctx.state.doc.line(n).text
    if (prev.trim() === '') return 0
    const lead = prev.match(/^[ \t]*/)
    const leadLen = lead ? lead[0].length : 0
    if (leadLen > 0) return leadLen
    if (/^\d{4}-\d{2}-\d{2}/.test(prev)) return INDENT.length
    return 0
  }
  return 0
})

const beancountTabKeymap = keymap.of([
  {
    key: 'Tab',
    run: (view) => {
      const { state } = view
      const multiLine = state.selection.ranges.some(
        (r) => state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number,
      )
      if (multiLine) return indentMore(view)
      view.dispatch(state.replaceSelection(INDENT))
      return true
    },
    shift: indentLess,
  },
])

const splitCache = new WeakMap<Text, ReturnType<typeof splitEntries>>()
function cachedSplit(doc: Text): ReturnType<typeof splitEntries> {
  let hit = splitCache.get(doc)
  if (!hit) {
    hit = splitEntries(doc.toString())
    splitCache.set(doc, hit)
  }
  return hit
}

const beancountFoldService = foldService.of((state, lineStart) => {
  const doc = state.doc
  const headerLineNum = doc.lineAt(lineStart).number - 1
  const entry = cachedSplit(doc).find((e) => e.startLine === headerLineNum)
  if (!entry) return null
  let endLine1 = entry.endLine + 1
  while (endLine1 > entry.startLine + 1 && doc.line(endLine1).text.trim() === '') {
    endLine1 -= 1
  }
  if (endLine1 === entry.startLine + 1) return null
  const headerLine = doc.line(entry.startLine + 1)
  const lastLine = doc.line(endLine1)
  return { from: headerLine.to, to: lastLine.to }
})

const entryBand = Decoration.line({ attributes: { class: 'cm-txn-band' } })

class TxnBandGutterMarker extends GutterMarker {
  elementClass = 'cm-txn-band'
}
const entryBandGutterMarker = new TxnBandGutterMarker()


const trimTrailingWhitespace = EditorState.transactionFilter.of((tr: Transaction) => {
  if (!tr.docChanged) return tr
  const cursorLine = tr.newDoc.lineAt(tr.newSelection.main.head).number
  const touched = new Set<number>()
  tr.changes.iterChanges((_fA, _tA, fromB, toB) => {
    const fromLine = tr.newDoc.lineAt(fromB).number
    const toLine = tr.newDoc.lineAt(toB).number
    for (let n = fromLine; n <= toLine; n++) touched.add(n)
  })
  const extra: { from: number; to: number; insert: string }[] = []
  for (const n of touched) {
    if (n === cursorLine) continue
    const line = tr.newDoc.line(n)
    const trimmed = line.text.replace(/[ \t]+$/, '')
    if (trimmed.length === line.text.length) continue
    extra.push({ from: line.from + trimmed.length, to: line.to, insert: '' })
  }
  if (extra.length === 0) return tr
  return [tr, { changes: extra, selection: tr.newSelection, sequential: true }]
})

type EntryBandSets = {
  lines: DecorationSet
  gutter: RangeSet<GutterMarker>
}

function buildEntryBandsFromDoc(doc: Text): EntryBandSets {
  const lineBuilder = new RangeSetBuilder<Decoration>()
  const gutterBuilder = new RangeSetBuilder<GutterMarker>()
  const entries = splitEntries(doc.toString())
  for (let i = 0; i < entries.length; i++) {
    if (i % 2 === 1) continue
    const e = entries[i]
    for (let ln = e.startLine; ln <= e.endLine; ln++) {
      const line = doc.line(ln + 1)
      lineBuilder.add(line.from, line.from, entryBand)
      gutterBuilder.add(line.from, line.from, entryBandGutterMarker)
    }
  }
  return { lines: lineBuilder.finish(), gutter: gutterBuilder.finish() }
}

const entryBandField = StateField.define<EntryBandSets>({
  create: (state) => buildEntryBandsFromDoc(state.doc),
  update(value, tr) {
    return tr.docChanged ? buildEntryBandsFromDoc(tr.newDoc) : value
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.lines),
    gutterLineClass.from(f, (v) => v.gutter),
  ],
})

function defineReactSlot<T>(initial: T): {
  field: StateField<T>
  effect: ReturnType<typeof StateEffect.define<T>>
} {
  const effect = StateEffect.define<T>()
  const field = StateField.define<T>({
    create: () => initial,
    update(value, tr) {
      for (const e of tr.effects) if (e.is(effect)) return e.value
      return value
    },
  })
  return { field, effect }
}

export type LedgerDiagnostic = Diagnostic
export type { ValidateContext, Validator } from '@/lib/beancount/validators'
export type { AccountCompleter } from '@/lib/beancount/entities'

const { field: validatorsField, effect: setValidators } =
  defineReactSlot<readonly Validator[]>([])
const { field: accountCompleterField, effect: setAccountCompleter } =
  defineReactSlot<AccountCompleter>(completeAccount)

export { setValidators, setAccountCompleter }

export function setBaseline(state: EditorState, baseline: string): StateEffect<unknown> {
  const current = getOriginalDoc(state)
  const changes = ChangeSet.of(
    [{ from: 0, to: current.length, insert: baseline }],
    current.length,
  )
  return originalDocChangeEffect(state, changes)
}

const ACCOUNT_PREFIX_RE = /[A-Z][A-Za-z0-9-]*(?::[A-Za-z0-9-]*)+/

const accountCompletionSource: CompletionSource = (context) => {
  const match = context.matchBefore(ACCOUNT_PREFIX_RE)
  if (!match) return null
  if (!context.explicit && match.from === match.to) return null
  const completer = context.state.field(accountCompleterField)
  const hits = completer(match.text)
  if (hits.length === 0) return null
  return {
    from: match.from,
    options: hits.map((label) => ({ label, type: 'class' })),
    validFor: /^[A-Za-z0-9:-]*$/,
  }
}

const autocompleteColonTrigger = EditorView.updateListener.of((u) => {
  if (!u.docChanged) return
  let typedColon = false
  u.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.toString().endsWith(':')) typedColon = true
  })
  if (!typedColon) return
  const pos = u.state.selection.main.head
  const before = u.state.doc.sliceString(Math.max(0, pos - 120), pos)
  if (/[A-Z][A-Za-z0-9-]*(?::[A-Za-z0-9-]*)*:$/.test(before)) {
    startCompletion(u.view)
  }
})


const parseLinter = linter(
  (view) => {
    const { diagnostics } = cachedParse(view.state.doc)
    return diagnostics.map((d) => ({
      from: d.from,
      to: d.to,
      severity: 'error' as const,
      message: d.message,
      source: 'parse',
    }))
  },
  { delay: 100 },
)

const composedLinter = linter(
  (view) => {
    const extra = view.state.field(validatorsField)
    const { entries } = cachedParse(view.state.doc)
    const ctx: ValidateContext = { parsed: entries, doc: view.state.doc.toString() }
    const out: Diagnostic[] = []
    for (const v of [...coreValidators, ...extra]) {
      try {
        out.push(...v(ctx))
      } catch (err) {
        console.error('ledger validator threw', err)
      }
    }
    return out
  },
  { delay: 300 },
)

export function buildScandiBeancountExtensions(initialBaseline: string) {
  return [
    beancountSupport,
    indentUnit.of(INDENT),
    beancountIndentService,
    beancountFoldService,
    beancountTabKeymap,
    trimTrailingWhitespace,
    entryBandField,
    highlightWhitespace(),
    unifiedMergeView({
      original: initialBaseline,
      mergeControls: false,
      gutter: true,
    }),
    validatorsField,
    parseLinter,
    composedLinter,
    lintGutter(),
    accountCompleterField,
    autocompletion({ override: [accountCompletionSource], activateOnTyping: true }),
    autocompleteColonTrigger,
    accountChips,
    accountChipTooltip,
    headerChips,
    headerChipTooltip,
    amountChips,
    diffChips,
    txnDescriptions,
    scandiEditorTheme,
  ]
}

export function composeBuffer(rawTexts: string[]): string {
  return rawTexts.map((r) => r.trim()).join('\n\n') + '\n'
}
