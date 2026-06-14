'use client'

import { useEffect, useRef, useState } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { ArrowRightLeft, ArrowUp, Check, Copy, CreditCard, FileText, Paperclip, Scale } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Loader } from '@/components/ai-elements/loader'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import {
  Tool,
  ToolContent,
  ToolHeader,
} from '@/components/ai-elements/tool'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import Link from 'next/link'
import { isGenUiTool, renderGenUi } from '@/app/(frontend)/ai/gen-ui'
import { StatementUploadModal } from '@/components/statement-upload-modal'
import { AddAccountsModal } from '@/components/add-accounts-modal'
import { UpdateBalanceModal } from '@/components/update-balance-modal'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'
import type { ToolUIPart } from 'ai'
import type { ChatDOState } from '@/durable/chat-do'

type Part = {
  type: string
  text?: string
  state?: ToolUIPart['state'] | 'streaming' | 'done'
  input?: unknown
  output?: unknown
  errorText?: string
  toolCallId?: string
  toolName?: string
  [k: string]: unknown
}

// Tool parts come in two shapes: static (`type: "tool-<name>"`) and dynamic
// (`type: "dynamic-tool"` with a separate `toolName`). draft_transaction and
// clarify are registered with `dynamicTool` so the SDK surfaces input-validation
// errors back to the model (static client tools are silently dropped on invalid
// input); handoff and read_statement are static. Normalize both here so the
// rest of the UI treats them uniformly.
function isToolPart(p: Part): boolean {
  return p.type.startsWith('tool-') || p.type === 'dynamic-tool'
}
function toolNameOf(p: Part): string | null {
  if (p.type === 'dynamic-tool') return typeof p.toolName === 'string' ? p.toolName : null
  if (p.type.startsWith('tool-')) return p.type.slice(5)
  return null
}

function Composer({
  onSubmit,
  status,
  onStop,
  onAttachClick,
  onAddCard,
  onUpdateBalance,
}: {
  onSubmit: (m: PromptInputMessage) => void
  status: ReturnType<typeof useAgentChat>['status']
  onStop: () => void
  // Opens the statement upload modal — statements are Inbox items; the
  // composer carries text only.
  onAttachClick: () => void
  // Always-present account actions (owner call).
  onAddCard: () => void
  onUpdateBalance: () => void
}) {
  const chip =
    'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none'
  return (
    <div className="flex w-full flex-col gap-2">
      {/* Labeled actions ABOVE the input, always present (owner call) —
          not unlabeled icons buried in the footer. */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onAttachClick} className={chip}>
          <Paperclip className="size-3.5" />
          Upload statement
        </button>
        <button type="button" onClick={onAddCard} className={chip}>
          <CreditCard className="size-3.5" />
          Add accounts
        </button>
        <button type="button" onClick={onUpdateBalance} className={chip}>
          <Scale className="size-3.5" />
          Update balance
        </button>
      </div>
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea placeholder="Ask anything" />
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit status={status} onStop={onStop}>
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}

// The chat message that uploaded a statement carries a self-closing
// reference tag: <statement id="STMT-…" filename="…" />. We pull it out of
// the message text so we can render a file chip in its place (and keep the
// raw tag out of the visible bubble / copy text).
const STATEMENT_REF_RE = /<statement\s+id="([^"]*)"\s+filename="([^"]*)"\s*\/>/g

function parseStatementRefs(text: string): {
  text: string
  refs: Array<{ id: string; filename: string }>
} {
  const refs: Array<{ id: string; filename: string }> = []
  const cleaned = text
    .replace(STATEMENT_REF_RE, (_m, id: string, filename: string) => {
      refs.push({ id, filename })
      return ''
    })
    .trim()
  return { text: cleaned, refs }
}

// The user's uploaded statement renders as a static chip in their message —
// the specialist reads and drafts inline within the turn, so there's no
// separate server-side extraction status to surface.
function SentStatementChip({ filename }: { filename: string }) {
  return (
    <div className="my-1 flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1.5 text-xs">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate font-medium text-foreground">
        {filename}
      </span>
    </div>
  )
}

// Friendly labels for the visible handoff seam. Keep in sync with the editor
// registry's agent names (src/durable/agents/registries/editor.ts).
const AGENT_LABELS: Record<string, string> = {
  ledger: 'Editor',
  statement: 'Statement specialist',
}

// The handoff tool runs server-side and surfaces here as a `tool-handoff`
// message part (input {to, context}, output {ok, handed_off_to}). We render it
// as an inline divider so the conversation visibly seams when one specialist
// takes over from another, rather than as a generic tool card.
function HandoffChip({ to }: { to: string }) {
  const label = AGENT_LABELS[to] ?? to
  return (
    <div className="my-3 flex items-center gap-2 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 font-medium text-muted-foreground">
        <ArrowRightLeft className="size-3" />
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

export function Chat({
  onBusyChange,
  onClearableChange,
  onAppended,
  onShowInJournal,
}: {
  onBusyChange?: (busy: boolean) => void
  onClearableChange?: (state: { canClear: boolean; clear: () => void }) => void
  onAppended?: () => void
  // Opens the Journal filtered to a date range (split pane / tab switch).
  onShowInJournal?: (range: { from: string; to: string } | null) => void
} = {}) {
  const agent = useAgent<ChatDOState>({ agent: 'ChatDO', basePath: 'api/agents/editor' })
  const {
    messages,
    sendMessage,
    status,
    stop,
    addToolOutput,
    clearHistory,
    isStreaming,
    isToolContinuation,
  } = useAgentChat({
    agent,
    // The card IS the proposal; don't let the model continue after a tool
    // result. Approve transitions the card to "done" locally and we're
    // ready for the next user message. Reject just dismisses the card —
    // no apology / retry from the model.
    autoContinueAfterToolResult: false,
    // Skip the library's HTTP /get-messages fetch. On SSR `useAgent` builds
    // a partysocket URL pointing at "dummy-domain.com" (its fallback when
    // window is undefined), and `useAgentChat` then calls `use(fetch(...))`
    // against that URL — the resulting snapshot diverges from client and
    // causes React #418. Setting this to null short-circuits that path; the
    // WebSocket connection still replays history via the resume flow.
    getInitialMessages: null,
  })

  const [submitStatus, setSubmitStatus] = useState<
    Record<string, 'idle' | 'submitting' | 'done' | 'failed'>
  >({})
  const [submitError, setSubmitError] = useState<Record<string, string>>({})
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string[]>>({})
  const [accounts, setAccounts] = useState<string[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  // Guards handleSubmit against re-entry. attachStatement is an async network
  // round-trip; until sendMessage runs, `status` is still idle and the submit
  // button isn't disabled, so a second Enter/click would fire a second upload
  // and dispatch a duplicate statement. A duplicate in-flight statement
  // collides with the first's pending draft_transaction tool call and wedges
  // the turn (AI_MissingToolResultsError).
  const submittingRef = useRef(false)
  // Run-once guard for the ?statement= auto-send path. The Chat component
  // mounts after hydration (EditorShell delays with `mounted` state), so this
  // effect fires exactly once per page load. The ref prevents a second send if
  // React ever re-runs effects in strict mode.
  const autoSentStatementRef = useRef<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    ledgerClient
      .getAccounts({ signal: ac.signal })
      .then((r) => setAccounts(r.accounts))
      .catch(() => {})
    return () => ac.abort()
  }, [])

  // ?statement= MUST NEVER start a run (owner decree, learned the hard way:
  // browser autocomplete resurrects old editor?statement= URLs from history,
  // and the in-history guard raced hydration — every address-bar visit
  // re-processed the statement). The params are stripped and IGNORED. The
  // paperclip (explicit attach + send) is the only interactive entry;
  // statements otherwise live in the Inbox. ?prefill= (Vault CTAs — plain
  // text, no statement semantics) is the one allowed auto-send.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const prefill = p.get('prefill')?.trim()
    if (p.has('statement') || p.has('filename') || p.has('prompt') || p.has('prefill')) {
      history.replaceState(null, '', window.location.pathname)
    }
    if (prefill && !p.has('statement')) {
      if (autoSentStatementRef.current !== `prefill:${prefill}`) {
        autoSentStatementRef.current = `prefill:${prefill}`
        void sendMessage({ text: prefill })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshAccounts() {
    try {
      const r = await ledgerClient.getAccounts()
      setAccounts(r.accounts)
    } catch {}
  }

  const busy = isStreaming
  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  // clearHistory from useAgentChat is not reference-stable across renders;
  // depending on it directly turns this effect into a setState loop with the
  // parent. Route through a ref so the effect only fires when canClear flips.
  const clearHistoryRef = useRef(clearHistory)
  clearHistoryRef.current = clearHistory
  const canClear = messages.length > 0
  useEffect(() => {
    onClearableChange?.({
      canClear,
      // Clearing the conversation also resets the active agent back to the
      // entry (ledger) so the next statement upload triggers a fresh, visible
      // handoff — activeAgent persists server-side and a message-only clear
      // would otherwise leave us stuck on the statement specialist.
      clear: () => {
        // Abort any live (or zombie) turn first — clearing must never be
        // hostage to a stream that won't end.
        try {
          stop()
        } catch {
          /* no active stream */
        }
        void ledgerClient.resetAgent().catch(() => {})
        clearHistoryRef.current()
      },
    })
  }, [canClear, onClearableChange])

  const [addCardOpen, setAddCardOpen] = useState(false)
  const [updateBalanceOpen, setUpdateBalanceOpen] = useState(false)
  function addCardFlow() {
    setAddCardOpen(true)
  }

  async function handleSubmit(message: PromptInputMessage) {
    const userText = message.text.trim()
    if (!userText) return
    if (submittingRef.current) return // re-entry guard (see ref decl)
    submittingRef.current = true
    try {
      // Any tool cards still awaiting a decision get superseded by the new
      // message — otherwise the agent stays stuck waiting on them.
      for (const m of messages) {
        const parts = Array.isArray(m.parts) ? (m.parts as Part[]) : []
        for (const p of parts) {
          if (!isToolPart(p)) continue
          if (!p.toolCallId) continue
          if (p.state !== 'input-available' && p.state !== 'input-streaming') continue
          const sub = submitStatus[p.toolCallId]
          if (sub === 'done' || sub === 'failed' || sub === 'submitting') continue
          addToolOutput({
            toolCallId: p.toolCallId,
            output: { ok: false, reason: 'superseded' },
          })
        }
      }
      void sendMessage({ text: userText })
    } finally {
      submittingRef.current = false
    }
  }

  async function handleApprove(
    toolCallId: string,
    finalText: string,
    meta?: { approved: number; skipped: number },
  ) {
    setSubmitStatus((s) => ({ ...s, [toolCallId]: 'submitting' }))
    setSubmitError((s) => {
      const { [toolCallId]: _drop, ...rest } = s
      return rest
    })
    try {
      // Append-only: knownIds: [] tells the server "delete nothing, just
      // parse-and-insert what's in buffer". Avoids re-sending the full
      // journal text and side-steps OCC races against a user-side edit.
      const r = await ledgerClient.replaceBuffer([], finalText)
      if (isReplaceBufferError(r)) {
        const message = 'message' in r ? r.message : 'Save conflict'
        setSubmitStatus((s) => ({ ...s, [toolCallId]: 'failed' }))
        setSubmitError((s) => ({ ...s, [toolCallId]: message }))
        addToolOutput({
          toolCallId,
          output: { ok: false, error: message },
          state: 'output-error',
          errorText: message,
        })
        return
      }
      setSubmitStatus((s) => ({ ...s, [toolCallId]: 'done' }))
      addToolOutput({
        toolCallId,
        output: {
          ok: true,
          committed: finalText.trim(),
          ...(meta && meta.skipped > 0 ? { skipped_by_user: meta.skipped } : {}),
        },
      })
      void refreshAccounts()
      onAppended?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setSubmitStatus((s) => ({ ...s, [toolCallId]: 'failed' }))
      setSubmitError((s) => ({ ...s, [toolCallId]: msg }))
      addToolOutput({
        toolCallId,
        output: { ok: false, error: msg },
        state: 'output-error',
        errorText: msg,
      })
    }
  }

  function handleReject(toolCallId: string) {
    addToolOutput({
      toolCallId,
      output: { ok: false, reason: 'rejected' },
    })
  }

  function handleClarifyAnswer(toolCallId: string, answers: string[]) {
    setClarifyAnswers((s) => ({ ...s, [toolCallId]: answers }))
    addToolOutput({
      toolCallId,
      output: { answers },
    })
    // clarify NEEDS continuation — the model asked, the user answered, the
    // model must now produce the next step (typically draft_transaction).
    // draft_transaction stays halting via autoContinueAfterToolResult: false;
    // we manually nudge here with an empty user message.
    void sendMessage({ text: '' })
  }

  const isEmpty = messages.length === 0
  const showThinking =
    (status === 'submitted' || status === 'streaming') && !isToolContinuation
  const hasAssistantContent = (() => {
    if (messages.length === 0) return false
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') return false
    const parts = Array.isArray(last.parts) ? (last.parts as Part[]) : []
    return parts.some(
      (p) =>
        (p.type === 'text' && typeof p.text === 'string' && p.text.length > 0) ||
        p.type === 'reasoning' ||
        isToolPart(p),
    )
  })()
  const showThinkingBubble = showThinking && !hasAssistantContent

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <StatementUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <AddAccountsModal
        open={addCardOpen}
        onClose={() => setAddCardOpen(false)}
        onDone={() => {
          void refreshAccounts()
          onAppended?.()
        }}
      />
      <UpdateBalanceModal
        open={updateBalanceOpen}
        onClose={() => setUpdateBalanceOpen(false)}
        onDone={() => {
          void refreshAccounts()
          onAppended?.()
        }}
      />
      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="flex w-full max-w-3xl -translate-y-8 flex-col items-center gap-7">
            <h1 className="text-3xl font-semibold tracking-tight">
              How can I help?
            </h1>
            <PromptInputProvider>
              <div className="flex w-full flex-col gap-3">
                <Composer
                  onSubmit={handleSubmit}
                  status={status}
                  onStop={stop}
                  onAttachClick={() => setUploadOpen(true)}
                  onAddCard={addCardFlow}
                  onUpdateBalance={() => setUpdateBalanceOpen(true)}
                />
              </div>
            </PromptInputProvider>
            <PendingCapturesHint />
          </div>
        </div>
      ) : (
        <>
          <Conversation>
            <ConversationContent className="mx-auto w-full max-w-3xl py-6">
              {messages.map((m) => {
                const parts = Array.isArray(m.parts) ? (m.parts as Part[]) : []
                // Programmatic turns we inject to drive the agent (the
                // extractor handoff carrying the raw beancount, failure
                // notes) are role 'user' but must stay invisible — the user
                // must not see the subagent plumbing.
                const isInjected = parts.some(
                  (p) =>
                    p.type === 'text' &&
                    typeof p.text === 'string' &&
                    p.text.trimStart().startsWith('[system]'),
                )
                if (isInjected) return null
                const textBlob = parts
                  .filter((p) => p.type === 'text' && typeof p.text === 'string')
                  .map((p) => parseStatementRefs(p.text as string).text)
                  .join('\n\n')
                  .trim()
                return (
                  <Message key={m.id} from={m.role}>
                    <MessageContent
                      className={m.role === 'assistant' ? 'w-full' : undefined}
                    >
                      {parts.map((p, i) => {
                        if (p.type === 'text' && typeof p.text === 'string') {
                          const { text: cleaned, refs } = parseStatementRefs(
                            p.text,
                          )
                          return (
                            <div key={i}>
                              {refs.map((r) => (
                                <SentStatementChip key={r.id} filename={r.filename} />
                              ))}
                              {cleaned ? (
                                // The user's own text is rendered VERBATIM —
                                // pasting a statement (with `#`, `*`, etc.)
                                // must not get interpreted as markdown headings
                                // / bold. Only the assistant's replies are
                                // markdown. whitespace-pre-wrap keeps the
                                // pasted line breaks.
                                m.role === 'user' ? (
                                  <div className="whitespace-pre-wrap break-words">
                                    {cleaned}
                                  </div>
                                ) : (
                                  <MessageResponse>{cleaned}</MessageResponse>
                                )
                              ) : null}
                            </div>
                          )
                        }
                        if (p.type === 'reasoning' && typeof p.text === 'string') {
                          // defaultOpen={true} so live reasoning expands as it
                          // streams; ai-elements auto-collapses ~1s after the
                          // stream ends. Trade-off: completed reasoning loaded
                          // from history briefly flashes open before closing.
                          return (
                            <Reasoning
                              key={i}
                              isStreaming={p.state === 'streaming'}
                              defaultOpen
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>{p.text}</ReasoningContent>
                            </Reasoning>
                          )
                        }
                        if (p.type === 'tool-handoff') {
                          const out =
                            p.output && typeof p.output === 'object'
                              ? (p.output as {
                                  ok?: boolean
                                  handed_off_to?: string
                                })
                              : null
                          // A rejected edge (ok:false) never moved the
                          // conversation — show nothing.
                          if (out && out.ok === false) return null
                          const inp =
                            p.input && typeof p.input === 'object'
                              ? (p.input as { to?: string })
                              : null
                          const to = out?.handed_off_to ?? inp?.to
                          if (!to) return null
                          return <HandoffChip key={i} to={to} />
                        }
                        if (isToolPart(p)) {
                          const toolCallId = p.toolCallId ?? `${m.id}-${i}`
                          const toolName = toolNameOf(p)
                          const subState = submitStatus[toolCallId] ?? 'idle'
                          const outputObj =
                            p.output && typeof p.output === 'object'
                              ? (p.output as {
                                  ok?: boolean
                                  reason?: string
                                })
                              : null
                          // Rejection covers explicit user reject/supersede and
                          // tool-call output-error (e.g. input-validation failure
                          // surfaced by the SDK for dynamic tools).
                          const isRejection =
                            p.state === 'output-error' ||
                            (p.state === 'output-available' &&
                              outputObj?.ok === false &&
                              (outputObj.reason === 'rejected' ||
                                outputObj.reason === 'superseded'))
                          const cardStatus = isRejection
                            ? 'rejected'
                            : p.state === 'output-available' || subState === 'done'
                              ? 'done'
                              : subState === 'submitting'
                                ? 'submitting'
                                : subState === 'failed' || p.state === 'output-error'
                                  ? 'failed'
                                  : 'idle'
                          const toolState: ToolUIPart['state'] =
                            cardStatus === 'done' || cardStatus === 'rejected'
                              ? 'output-available'
                              : cardStatus === 'failed'
                                ? 'output-error'
                                : cardStatus === 'submitting'
                                  ? 'input-available'
                                  : ((p.state as ToolUIPart['state'] | undefined) ?? 'input-streaming')
                          // A part whose args never finished streaming can only
                          // complete during a live turn. In history it is a
                          // fossil (interrupted stream / corrupt tool JSON) —
                          // render it dead, not as an eternal "Preparing…".
                          const isLiveTurn = status === 'streaming' || status === 'submitted'
                          const isDead = toolState === 'input-streaming' && !isLiveTurn
                          // Don't render the card from partial input: while the
                          // tool-call args still stream (input-streaming), p.input
                          // is incomplete JSON, so the draft/clarify card would
                          // flash half-formed values (an empty batch, a lone "2"
                          // before the amount finishes). Wait for input-available;
                          // show the Preparing… placeholder until then.
                          const rendered =
                            toolName && isGenUiTool(toolName) && toolState !== 'input-streaming'
                              ? renderGenUi(toolName, p.input, {
                                  accounts,
                                  status: cardStatus,
                                  errorMessage:
                                    submitError[toolCallId] ?? p.errorText,
                                  resolvedAnswers: clarifyAnswers[toolCallId],
                                  onApprove: (final, meta) =>
                                    void handleApprove(toolCallId, final, meta),
                                  onShowInJournal,
                                  onAnswer: (answers) =>
                                    handleClarifyAnswer(toolCallId, answers),
                                  onAddCard: (result) => {
                                    setSubmitStatus((s) => ({ ...s, [toolCallId]: 'done' }))
                                    addToolOutput({ toolCallId, output: result })
                                    // like clarify: the model must continue
                                    // (draft the open directives next).
                                    void sendMessage({ text: '' })
                                  },
                                  onReject: () => handleReject(toolCallId),
                                })
                              : null
                          // ToolHeader's default label is `type.split('-').slice(1).join('-')`
                          // — gives the right label for `tool-X` but yields "tool" for
                          // `dynamic-tool`. Pass the resolved name as `title`.
                          return (
                            <Tool key={i} defaultOpen>
                              <ToolHeader
                                title={toolName ?? undefined}
                                type={p.type as ToolUIPart['type']}
                                state={isDead ? 'output-error' : toolState}
                              />
                              <ToolContent>
                                {isDead ? (
                                  <div className="p-4 text-xs text-muted-foreground">
                                    Interrupted — this call never completed. Re-send the
                                    request if you still need it.
                                  </div>
                                ) : rendered ? (
                                  <div className="p-2">{rendered}</div>
                                ) : (
                                  <div className="p-4 text-xs text-muted-foreground">
                                    {toolState === 'input-streaming'
                                      ? 'Preparing…'
                                      : 'Waiting for input…'}
                                  </div>
                                )}
                              </ToolContent>
                            </Tool>
                          )
                        }
                        return null
                      })}
                    </MessageContent>
                    {textBlob ? <CopyMessageButton text={textBlob} /> : null}
                  </Message>
                )
              })}
              {showThinkingBubble ? (
                <Message from="assistant">
                  <MessageContent>
                    <Loader />
                  </MessageContent>
                </Message>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="mx-auto w-full max-w-3xl px-4 pb-4">
            <Composer
              onSubmit={handleSubmit}
              status={status}
              onStop={stop}
              onAttachClick={() => setUploadOpen(true)}
              onAddCard={addCardFlow}
              onUpdateBalance={() => setUpdateBalanceOpen(true)}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              MilesVault can make mistakes. Check important info.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? 'Copied' : 'Copy message'}
      title={copied ? 'Copied' : 'Copy message'}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-foreground group-[.is-user]:ml-auto focus-visible:opacity-100"
    >
      {copied ? (
        <Check className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  )
}

// Returning users with Inbox work get pointed at it from the empty chat.
function PendingCapturesHint() {
  const [pending, setPending] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/captures')
      .then((r) => (r.ok ? (r.json() as Promise<{ rows?: Array<{ state: string; draft_error: string | null }> }>) : null))
      .then((d) => {
        if (cancelled || !d) return
        // Only items ready for the user — drafts extracted, or a failed
        // background draft. Still-drafting (captured/processing) doesn't count.
        setPending(
          (d.rows ?? []).filter((c) => (c.state === 'extracted' || (c.draft_error != null && c.state !== 'posted' && c.state !== 'dismissed'))).length,
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  if (pending === 0) return null
  return (
    <Link
      href="/inbox"
      className="rounded-full border border-amber-200/60 bg-amber-50 px-3 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
    >
      {pending} item{pending === 1 ? '' : 's'} waiting in the Inbox →
    </Link>
  )
}
