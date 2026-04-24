import {
  type Extension,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import {
  NAVY_700,
  ROSE_700,
  SANS_STACK,
  SLATE_200,
  SLATE_400,
  SLATE_500,
  SLATE_600,
  SLATE_50,
} from './editor-theme'
import { splitEntries } from '@/lib/beancount/extract'
import { applyProposal, type Op, type Snapshot } from './propose'

type Role = 'user' | 'assistant'
type AppliedEdit = { beforeBuffer: string; afterBuffer: string; summary: string }
type Message = {
  role: Role
  content: string
  applied?: AppliedEdit
  applyError?: string
}
type AiStatus = 'idle' | 'streaming' | 'error'
type AiSession = {
  id: string
  selection: { from: number; to: number }
  messages: Message[]
  status: AiStatus
  error: string | null
}

const aiOpen = StateEffect.define<{ selection: { from: number; to: number } }>()
const aiClose = StateEffect.define<null>()
const aiAppendUser = StateEffect.define<string>()
const aiStreamStart = StateEffect.define<null>()
const aiStreamDelta = StateEffect.define<string>()
const aiStreamEnd = StateEffect.define<{ applied?: AppliedEdit; applyError?: string }>()
const aiStreamError = StateEffect.define<string>()

export const setAiSnapshots = StateEffect.define<readonly Snapshot[]>()
const snapshotsField = StateField.define<readonly Snapshot[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setAiSnapshots)) return e.value
    return value
  },
})

function parseResponse(text: string): { reply: string; ops: Op[] | null } {
  const opsMatch = text.match(/<ops>([\s\S]*?)<\/ops>/)
  const replyMatch = text.match(/<reply>([\s\S]*?)<\/reply>/)
  let ops: Op[] | null = null
  if (opsMatch) {
    try {
      const parsed = JSON.parse(opsMatch[1].trim())
      if (Array.isArray(parsed) && parsed.length > 0) ops = parsed as Op[]
    } catch {}
  }
  const reply = replyMatch
    ? replyMatch[1].trim()
    : text.replace(/<ops>[\s\S]*?<\/ops>/, '').replace(/<\/?reply>/g, '').trim()
  return { reply, ops }
}

const aiField = StateField.define<AiSession | null>({
  create: () => null,
  update(value, tr) {
    let next = value
    for (const e of tr.effects) {
      if (e.is(aiOpen)) {
        next = {
          id: crypto.randomUUID(),
          selection: e.value.selection,
          messages: [],
          status: 'idle',
          error: null,
        }
      } else if (e.is(aiClose)) {
        next = null
      } else if (next && e.is(aiAppendUser)) {
        next = {
          ...next,
          messages: [...next.messages, { role: 'user', content: e.value }],
        }
      } else if (next && e.is(aiStreamStart)) {
        next = {
          ...next,
          messages: [...next.messages, { role: 'assistant', content: '' }],
          status: 'streaming',
          error: null,
        }
      } else if (next && e.is(aiStreamDelta)) {
        const msgs = next.messages.slice()
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, content: last.content + e.value }
          next = { ...next, messages: msgs }
        }
      } else if (next && e.is(aiStreamEnd)) {
        const msgs = next.messages.slice()
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') {
          const finalContent =
            e.value.applied?.summary ?? parseResponse(last.content).reply
          msgs[msgs.length - 1] = {
            role: 'assistant',
            content: finalContent,
            applied: e.value.applied,
            applyError: e.value.applyError,
          }
        }
        next = { ...next, messages: msgs, status: 'idle' }
      } else if (next && e.is(aiStreamError)) {
        next = { ...next, status: 'error', error: e.value }
      }
    }
    return next
  },
  provide: (f) =>
    EditorView.decorations.from(f, (s) => {
      if (!s) return Decoration.none
      const b = new RangeSetBuilder<Decoration>()
      b.add(
        s.selection.to,
        s.selection.to,
        Decoration.widget({ widget: new AiWidget(s.id), block: true, side: 1 }),
      )
      return b.finish() as DecorationSet
    }),
})

class AiWidget extends WidgetType {
  constructor(readonly sessionId: string) {
    super()
  }
  eq(other: WidgetType): boolean {
    return other instanceof AiWidget && other.sessionId === this.sessionId
  }
  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div')
    root.className = 'cm-ai-widget'
    root.dataset.aiSession = this.sessionId
    root.innerHTML = `
      <div class="cm-ai-messages"></div>
      <div class="cm-ai-status" hidden></div>
      <form class="cm-ai-input-row">
        <textarea class="cm-ai-input" rows="1" placeholder="Ask to edit any transaction… (Enter sends, Esc closes)"></textarea>
        <button type="submit" class="cm-ai-send">Send</button>
        <button type="button" class="cm-ai-close" aria-label="Close">×</button>
      </form>
    `
    const ac = new AbortController()
    widgetAborts.set(root, ac)
    wireWidget(root, view, this.sessionId, ac.signal)
    renderFull(root, view.state.field(aiField), view.state.doc.toString())
    queueMicrotask(() => {
      root.querySelector<HTMLTextAreaElement>('.cm-ai-input')?.focus()
    })
    return root
  }
  destroy(dom: HTMLElement): void {
    widgetAborts.get(dom)?.abort()
    widgetAborts.delete(dom)
  }
  ignoreEvent(): boolean {
    return true
  }
}

const widgetAborts = new WeakMap<HTMLElement, AbortController>()

function wireWidget(
  root: HTMLElement,
  view: EditorView,
  sessionId: string,
  signal: AbortSignal,
) {
  const input = root.querySelector<HTMLTextAreaElement>('.cm-ai-input')!
  const form = root.querySelector<HTMLFormElement>('.cm-ai-input-row')!
  const close = root.querySelector<HTMLButtonElement>('.cm-ai-close')!

  form.addEventListener(
    'submit',
    (ev) => {
      ev.preventDefault()
      const text = input.value.trim()
      if (!text) return
      input.value = ''
      void submitPrompt(view, sessionId, text)
    },
    { signal },
  )
  close.addEventListener(
    'click',
    (ev) => {
      ev.preventDefault()
      closeWidget(view)
    },
    { signal },
  )
  input.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault()
        form.requestSubmit()
      } else if (ev.key === 'Escape') {
        ev.preventDefault()
        closeWidget(view)
      }
    },
    { signal },
  )
  root.addEventListener(
    'click',
    (ev) => {
      const target = ev.target as HTMLElement
      if (target.matches('.cm-ai-undo')) {
        const idx = Number(target.dataset.msg)
        undoEdit(view, idx)
      }
    },
    { signal },
  )
}

function renderMessageBubble(m: Message, index: number, currentDoc: string): HTMLDivElement {
  const bubble = document.createElement('div')
  bubble.className = `cm-ai-message cm-ai-${m.role}`
  const body = document.createElement('div')
  body.className = 'cm-ai-message-body'
  body.textContent = m.content
  bubble.appendChild(body)
  if (m.applyError) {
    const err = document.createElement('div')
    err.className = 'cm-ai-apply-error'
    err.textContent = `couldn't apply: ${m.applyError}`
    bubble.appendChild(err)
  }
  if (m.applied) {
    const actions = document.createElement('div')
    actions.className = 'cm-ai-actions'
    const undo = document.createElement('button')
    undo.className = 'cm-ai-undo'
    undo.dataset.msg = String(index)
    undo.textContent = 'Undo'
    undo.disabled = currentDoc !== m.applied.afterBuffer
    actions.appendChild(undo)
    bubble.appendChild(actions)
  }
  return bubble
}

function renderFull(root: HTMLElement, state: AiSession | null, currentDoc: string) {
  if (!state || state.id !== root.dataset.aiSession) return
  const messagesEl = root.querySelector<HTMLDivElement>('.cm-ai-messages')!
  messagesEl.replaceChildren(
    ...state.messages.map((m, i) => renderMessageBubble(m, i, currentDoc)),
  )
  renderStatus(root, state)
}

function renderStatus(root: HTMLElement, state: AiSession) {
  const status = root.querySelector<HTMLDivElement>('.cm-ai-status')!
  if (state.status === 'error') {
    status.hidden = false
    status.textContent = state.error ?? 'something went wrong'
    status.className = 'cm-ai-status cm-ai-status-error'
  } else if (state.status === 'streaming') {
    status.hidden = false
    status.textContent = 'thinking…'
    status.className = 'cm-ai-status cm-ai-status-streaming'
  } else {
    status.hidden = true
  }
  const input = root.querySelector<HTMLTextAreaElement>('.cm-ai-input')!
  input.disabled = state.status === 'streaming'
}

function refreshUndoButtons(root: HTMLElement, state: AiSession, currentDoc: string) {
  const messagesEl = root.querySelector<HTMLDivElement>('.cm-ai-messages')!
  state.messages.forEach((m, i) => {
    if (!m.applied) return
    const bubble = messagesEl.children[i] as HTMLElement | undefined
    const btn = bubble?.querySelector<HTMLButtonElement>('.cm-ai-undo')
    if (btn) btn.disabled = currentDoc !== m.applied.afterBuffer
  })
}

function patchRender(
  root: HTMLElement,
  prev: AiSession | null,
  next: AiSession,
  currentDoc: string,
) {
  if (!prev || prev.id !== next.id || prev.messages.length !== next.messages.length) {
    renderFull(root, next, currentDoc)
    return
  }
  const lastIdx = next.messages.length - 1
  const lastPrev = prev.messages[lastIdx]
  const lastNext = next.messages[lastIdx]
  const structureChanged =
    !lastPrev ||
    lastPrev.role !== lastNext.role ||
    Boolean(lastPrev.applied) !== Boolean(lastNext.applied) ||
    Boolean(lastPrev.applyError) !== Boolean(lastNext.applyError)
  if (structureChanged) {
    renderFull(root, next, currentDoc)
    return
  }
  const messagesEl = root.querySelector<HTMLDivElement>('.cm-ai-messages')!
  const lastBubble = messagesEl.children[lastIdx] as HTMLElement | undefined
  const body = lastBubble?.querySelector<HTMLDivElement>('.cm-ai-message-body')
  if (body && lastPrev.content !== lastNext.content) {
    body.textContent = lastNext.content
  }
  renderStatus(root, next)
}

const aiSyncPlugin = ViewPlugin.fromClass(
  class {
    root: HTMLElement | null = null
    sessionId: string | null = null
    update(update: ViewUpdate) {
      const prev = update.startState.field(aiField, false)
      const next = update.state.field(aiField, false)
      const sessionChanged = prev !== next
      if (!next) {
        if (sessionChanged) {
          this.root = null
          this.sessionId = null
        }
        return
      }
      if (this.sessionId !== next.id || !this.root?.isConnected) {
        this.root = update.view.dom.querySelector<HTMLElement>(
          `.cm-ai-widget[data-ai-session="${next.id}"]`,
        )
        this.sessionId = next.id
      }
      if (!this.root) return
      const currentDoc = update.state.doc.toString()
      if (sessionChanged) {
        patchRender(this.root, prev ?? null, next, currentDoc)
      } else if (update.docChanged && next.messages.some((m) => m.applied)) {
        refreshUndoButtons(this.root, next, currentDoc)
      }
    }
  },
)

async function submitPrompt(view: EditorView, sessionId: string, text: string) {
  const pre = view.state.field(aiField, false)
  if (!pre || pre.id !== sessionId) return

  view.dispatch({
    effects: [aiAppendUser.of(text), aiStreamStart.of(null)],
  })

  const after = view.state.field(aiField, false)
  if (!after) return

  const buffer = view.state.doc.toString()
  const snapshots = view.state.field(snapshotsField)
  const docLen = view.state.doc.length
  const surroundingFrom = view.state.doc.lineAt(Math.max(0, after.selection.from - 1)).from
  const surroundingTo = view.state.doc.lineAt(Math.min(docLen, after.selection.to + 1)).to
  const surrounding = view.state.doc.sliceString(surroundingFrom, surroundingTo)
  const selectionText = view.state.doc.sliceString(after.selection.from, after.selection.to)

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  try {
    const res = await fetch('/api/ledger/ai-inline', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: after.messages
          .filter((m) => m.role !== 'assistant' || m.content.length > 0)
          .map(({ role, content }) => ({ role, content })),
        buffer,
        snapshots: snapshots.map((s) => ({ id: s.id, raw_text: s.raw_text })),
        selectionText,
        surrounding,
      }),
    })
    if (!res.ok || !res.body) {
      view.dispatch({ effects: aiStreamError.of(`server ${res.status}`) })
      return
    }
    reader = res.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      if (chunk) view.dispatch({ effects: aiStreamDelta.of(chunk) })
    }
    const tail = decoder.decode()
    if (tail) view.dispatch({ effects: aiStreamDelta.of(tail) })

    const finalState = view.state.field(aiField, false)
    const lastMsg = finalState?.messages[finalState.messages.length - 1]
    const parsed = parseResponse(lastMsg?.content ?? '')
    if (!parsed.ops) {
      view.dispatch({ effects: aiStreamEnd.of({}) })
      return
    }
    const beforeBuffer = view.state.doc.toString()
    const currentSnapshots = view.state.field(snapshotsField)
    const anchorRaw = view.state.doc.sliceString(after.selection.from, after.selection.to).trim()
    const result = applyProposal(
      beforeBuffer,
      currentSnapshots,
      parsed.ops,
      anchorRaw ? { rawText: anchorRaw } : undefined,
    )
    if (result.ok !== true) {
      view.dispatch({ effects: aiStreamEnd.of({ applyError: result.reason }) })
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result.buffer },
      effects: aiStreamEnd.of({
        applied: {
          beforeBuffer,
          afterBuffer: result.buffer,
          summary: parsed.reply,
        },
      }),
    })
  } catch (err) {
    view.dispatch({ effects: aiStreamError.of((err as Error).message) })
  } finally {
    reader?.releaseLock()
  }
}

function undoEdit(view: EditorView, msgIndex: number) {
  const state = view.state.field(aiField, false)
  if (!state) return
  const msg = state.messages[msgIndex]
  if (!msg?.applied) return
  const current = view.state.doc.toString()
  if (current !== msg.applied.afterBuffer) return
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: msg.applied.beforeBuffer },
  })
}

function closeWidget(view: EditorView) {
  view.dispatch({ effects: aiClose.of(null) })
  view.focus()
}

export function openAiForRange(view: EditorView, from: number, to: number): void {
  const existing = view.state.field(aiField, false)
  if (existing) {
    closeWidget(view)
    return
  }
  view.dispatch({ selection: { anchor: from, head: to }, effects: aiOpen.of({ selection: { from, to } }) })
}

function openForCurrentSelection(view: EditorView) {
  const existing = view.state.field(aiField, false)
  if (existing) {
    closeWidget(view)
    return
  }
  const doc = view.state.doc
  const sel = view.state.selection.main
  const cursorLine = doc.lineAt(sel.head)
  const entries = splitEntries(doc.toString())
  const cursorLineIdx = cursorLine.number - 1
  const containing = entries.find(
    (e) => cursorLineIdx >= e.startLine && cursorLineIdx <= e.endLine,
  )
  const selection = containing
    ? { from: doc.line(containing.startLine + 1).from, to: doc.line(containing.endLine + 1).to }
    : { from: cursorLine.from, to: cursorLine.to }
  view.dispatch({ effects: aiOpen.of({ selection }) })
}

const openKeymap = keymap.of([
  {
    key: 'Mod-i',
    preventDefault: true,
    run: (view) => {
      openForCurrentSelection(view)
      return true
    },
  },
])

const SLASH_AI_RE = /^\s*\/ai\s*$/

const slashAiTrigger = EditorView.updateListener.of((u) => {
  if (!u.docChanged) return
  if (u.state.field(aiField, false)) return
  const line = u.state.doc.lineAt(u.state.selection.main.head)
  if (!SLASH_AI_RE.test(line.text)) return
  queueMicrotask(() => {
    u.view.dispatch({
      changes: { from: line.from, to: line.to, insert: '' },
    })
    openForCurrentSelection(u.view)
  })
})

const aiTheme = EditorView.theme({
  '.cm-ai-widget': {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    margin: '8px 18px 12px',
    padding: '10px 12px',
    borderRadius: '6px',
    backgroundColor: '#FFFFFF',
    border: `1px solid ${SLATE_200}`,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    fontFamily: SANS_STACK,
    fontSize: '12px',
    lineHeight: '1.5',
    color: NAVY_700,
  },
  '.cm-ai-messages': { display: 'flex', flexDirection: 'column', gap: '6px' },
  '.cm-ai-messages:empty': { display: 'none' },
  '.cm-ai-message': { display: 'flex', flexDirection: 'column', gap: '4px' },
  '.cm-ai-user .cm-ai-message-body': { color: SLATE_600 },
  '.cm-ai-user .cm-ai-message-body:before': { content: '"› "', color: SLATE_400 },
  '.cm-ai-assistant .cm-ai-message-body': { color: NAVY_700 },
  '.cm-ai-apply-error': {
    margin: '4px 0 0',
    padding: '6px 8px',
    backgroundColor: SLATE_50,
    borderRadius: '6px',
    border: `1px solid ${SLATE_200}`,
    color: ROSE_700,
    fontSize: '11px',
  },
  '.cm-ai-actions': { display: 'flex', gap: '6px', marginTop: '4px' },
  '.cm-ai-actions button': {
    padding: '2px 10px',
    fontSize: '11px',
    border: `1px solid ${SLATE_200}`,
    borderRadius: '4px',
    backgroundColor: '#FFFFFF',
    color: NAVY_700,
    cursor: 'pointer',
  },
  '.cm-ai-actions button:disabled': {
    opacity: '0.4',
    cursor: 'default',
  },
  '.cm-ai-input-row': {
    display: 'flex',
    gap: '6px',
    alignItems: 'flex-start',
  },
  '.cm-ai-input': {
    flex: '1',
    resize: 'none',
    border: `1px solid ${SLATE_200}`,
    borderRadius: '6px',
    padding: '6px 8px',
    fontFamily: SANS_STACK,
    fontSize: '12px',
    lineHeight: '1.5',
    color: NAVY_700,
    backgroundColor: '#FFFFFF',
    outline: 'none',
  },
  '.cm-ai-input:focus': { borderColor: NAVY_700 },
  '.cm-ai-send, .cm-ai-close': {
    padding: '6px 10px',
    fontSize: '11px',
    border: `1px solid ${SLATE_200}`,
    borderRadius: '6px',
    backgroundColor: NAVY_700,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
  '.cm-ai-close': {
    backgroundColor: 'transparent',
    color: SLATE_500,
    borderColor: 'transparent',
    fontSize: '16px',
    lineHeight: '1',
  },
  '.cm-ai-status': {
    marginTop: '4px',
    fontSize: '11px',
    color: SLATE_500,
  },
  '.cm-ai-status-error': { color: ROSE_700 },
})

export const aiWidget: Extension = [
  aiField,
  snapshotsField,
  aiSyncPlugin,
  Prec.highest(openKeymap),
  slashAiTrigger,
  aiTheme,
]
