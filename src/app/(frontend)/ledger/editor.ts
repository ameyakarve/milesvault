import {
  autocompletion,
  type CompletionSource,
  startCompletion,
} from '@codemirror/autocomplete'
import { indentLess, indentMore } from '@codemirror/commands'
import {
  LanguageSupport,
  LRLanguage,
  indentService,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint'
import { RangeSetBuilder, StateEffect, StateField, type Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  keymap,
} from '@codemirror/view'
import { parser } from 'lezer-beancount'
import { type AccountCompleter, completeAccount } from '@/lib/beancount/accounts'
import { splitEntries } from '@/lib/beancount/extract'
import { parseBuffer } from '@/lib/beancount/parse'
import {
  type ValidateContext,
  type Validator,
  coreValidators,
} from '@/lib/beancount/validators'
import { diffHighlightExtension } from './editor-diff-decorations'
import { scandiEditorTheme, scandiHighlight } from './editor-theme'

const beancountLanguage = LRLanguage.define({
  name: 'beancount',
  parser,
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

const entryDivider = Decoration.line({ attributes: { class: 'cm-txn-divider' } })

function buildEntryDividers(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const entries = splitEntries(doc.toString())
  for (let i = 1; i < entries.length; i++) {
    const line = doc.line(entries[i].startLine + 1)
    builder.add(line.from, line.from, entryDivider)
  }
  return builder.finish()
}

const txnDividers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildEntryDividers(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = buildEntryDividers(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

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
export type { AccountCompleter } from '@/lib/beancount/accounts'

const baselineSlot = defineReactSlot<string>('')
const validatorsSlot = defineReactSlot<readonly Validator[]>([])
const accountCompleterSlot = defineReactSlot<AccountCompleter>(completeAccount)

const baselineBufferField = baselineSlot.field
const validatorsField = validatorsSlot.field
const accountCompleterField = accountCompleterSlot.field

export const setBaselineBuffer = baselineSlot.effect
export const setValidators = validatorsSlot.effect
export const setAccountCompleter = accountCompleterSlot.effect

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

const parseCache = new WeakMap<Text, ReturnType<typeof parseBuffer>>()
function cachedParse(doc: Text): ReturnType<typeof parseBuffer> {
  let hit = parseCache.get(doc)
  if (!hit) {
    hit = parseBuffer(doc.toString())
    parseCache.set(doc, hit)
  }
  return hit
}

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

export const scandiBeancountExtensions = [
  beancountSupport,
  indentUnit.of(INDENT),
  beancountIndentService,
  beancountTabKeymap,
  txnDividers,
  baselineBufferField,
  diffHighlightExtension(baselineBufferField),
  validatorsField,
  parseLinter,
  composedLinter,
  lintGutter(),
  accountCompleterField,
  autocompletion({ override: [accountCompletionSource], activateOnTyping: true }),
  autocompleteColonTrigger,
  scandiEditorTheme,
]

export function composeBuffer(rawTexts: string[]): string {
  return rawTexts.map((r) => r.trim()).join('\n\n') + '\n'
}
