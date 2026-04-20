import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat'
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  wrapLanguageModel,
  type ModelMessage,
  type UIMessage,
} from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createToolMiddleware } from '@ai-sdk-tool/parser'
import { buildLedgerTools } from '@/lib/chat/ledger-tools'
import { kimiProtocol } from '@/lib/chat/kimi-protocol'

type ToolUIPart = {
  type: `tool-${string}`
  toolCallId: string
  state:
    | 'input-streaming'
    | 'input-available'
    | 'approval-requested'
    | 'approval-responded'
    | 'output-available'
    | 'output-error'
    | 'output-denied'
  input?: unknown
  output?: unknown
  errorText?: string
  approval?: { id: string; approved?: boolean; reason?: string }
  providerExecuted?: boolean
}

function isToolPart(p: unknown): p is ToolUIPart {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as { type?: unknown }).type === 'string' &&
    (p as { type: string }).type.startsWith('tool-') &&
    'toolCallId' in p &&
    'state' in p
  )
}

function genApprovalId(): string {
  return `approval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// A pending approval that the user never resolved becomes an orphan tool-call when
// a fresh user message arrives — convertToLanguageModelPrompt would throw
// AI_MissingToolResultsError. Resolve each stale part to a terminal state here so
// history is self-consistent regardless of UI behaviour.
function resolveStalePendingTools(messages: UIMessage[]): {
  messages: UIMessage[]
  changed: boolean
} {
  let changed = false
  const out = messages.map((m) => {
    if (m.role !== 'assistant' || !Array.isArray(m.parts)) return m
    const newParts = m.parts.map((p) => {
      if (!isToolPart(p)) return p
      if (p.state === 'approval-requested') {
        changed = true
        return {
          ...p,
          state: 'output-denied',
          approval: {
            id: p.approval?.id ?? genApprovalId(),
            approved: false,
            reason: 'superseded by a newer message',
          },
        } satisfies ToolUIPart
      }
      if (p.state === 'input-available' || p.state === 'input-streaming') {
        changed = true
        return {
          ...p,
          state: 'output-error',
          errorText: 'superseded by a newer message',
        } satisfies ToolUIPart
      }
      return p
    })
    return { ...m, parts: newParts } as UIMessage
  })
  return { messages: out, changed }
}

// convertToLanguageModelPrompt throws AI_MissingToolResultsError if any
// assistant tool-call lacks a matching tool-result (or tool-approval-response
// with approved=true) by the time a user/system message is encountered. That
// invariant can be violated whenever the UI state is ahead of persistence
// (races, stale approvals, synthetic tool-call ids from middleware) — so we
// enforce it here, at the boundary, by injecting synthetic error tool-results
// for any orphans. This is the one place that guarantees the invariant;
// UI-level sanitizers are cosmetic on top.
function patchOrphanToolCalls(msgs: ModelMessage[]): ModelMessage[] {
  type AnyPart = {
    type?: string
    toolCallId?: string
    toolName?: string
    approvalId?: string
    providerExecuted?: boolean
  }

  const approvalIdToToolCallId = new Map<string, string>()
  for (const m of msgs) {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue
    for (const p of m.content as AnyPart[]) {
      if (p?.type === 'tool-approval-request' && p.approvalId && p.toolCallId) {
        approvalIdToToolCallId.set(p.approvalId, p.toolCallId)
      }
    }
  }
  const approvedToolCallIds = new Set<string>()
  for (const m of msgs) {
    if (m.role !== 'tool' || !Array.isArray(m.content)) continue
    for (const p of m.content as AnyPart[]) {
      if (p?.type === 'tool-approval-response' && p.approvalId) {
        const tcid = approvalIdToToolCallId.get(p.approvalId)
        if (tcid) approvedToolCallIds.add(tcid)
      }
    }
  }

  const pending = new Set<string>()
  const pendingNames = new Map<string, string>()
  const out: ModelMessage[] = []

  const flushOrphans = (): boolean => {
    for (const id of approvedToolCallIds) pending.delete(id)
    if (pending.size === 0) return false
    const synth = Array.from(pending).map((tcid) => ({
      type: 'tool-result' as const,
      toolCallId: tcid,
      toolName: pendingNames.get(tcid) ?? 'unknown',
      output: {
        type: 'error-text' as const,
        value: 'superseded: orphan tool-call patched at boundary',
      },
    }))
    const prev = out[out.length - 1]
    if (prev?.role === 'tool' && Array.isArray(prev.content)) {
      ;(prev.content as unknown[]).push(...synth)
    } else {
      out.push({ role: 'tool', content: synth } as ModelMessage)
    }
    pending.clear()
    return true
  }

  let patched = false
  for (const m of msgs) {
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      for (const p of m.content as AnyPart[]) {
        if (p?.type === 'tool-call' && p.toolCallId && !p.providerExecuted) {
          pending.add(p.toolCallId)
          if (p.toolName) pendingNames.set(p.toolCallId, p.toolName)
        }
      }
      out.push(m)
    } else if (m.role === 'tool' && Array.isArray(m.content)) {
      for (const p of m.content as AnyPart[]) {
        if (p?.type === 'tool-result' && p.toolCallId) pending.delete(p.toolCallId)
      }
      out.push(m)
    } else {
      if (flushOrphans()) patched = true
      out.push(m)
    }
  }
  if (flushOrphans()) patched = true
  if (patched) console.log('[chat] patched orphan tool-calls with synthetic error results')
  return out
}

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are MilesVault's ledger assistant. Help the user search, read,
and edit their beancount ledger using the provided tools.

# HARD RULE — do not break

If the user asks to add / create / record / log / enter a new transaction,
OR to edit / update / change / delete / remove an existing one, your response
MUST be a ledger_apply tool call. NEVER print beancount as plain text in
the assistant message — the UI renders an approval card from the tool call,
and plain text is NOT shown to the user as an editable card.

You emit a tool call using Kimi's native tokens, like this (literal format):

  <|tool_calls_section_begin|><|tool_call_begin|>functions.ledger_apply:0<|tool_call_argument_begin|>{"creates":[{"raw_text":"2026-04-20 * \\"Supermarket\\" \\"Groceries\\"\\n    Expenses:Food:Groceries      180.00 INR\\n    Income:Cashback              -20.00 INR\\n    Liabilities:CC:HSBC         -160.00 INR"}]}<|tool_call_end|><|tool_calls_section_end|>

No prose before it. No prose after it. Just the token section.

# Dates

Today is ${today}. Resolve partial dates ("19 april", "last tuesday")
relative to today; default year is ${today.slice(0, 4)}.

# Rules

- Always use tools to read or modify the ledger. Never invent transactions,
  ids, amounts, or accounts.
- ledger_apply takes { creates?, updates?, deletes? }. All items apply
  atomically. Outcome handling:
    { ok:true, created, updated, deleted } -> one-line confirmation
    { ok:false, rejected:true }            -> "discarded" + ask what to change
    { ok:false, errors }                   -> summarize errors, offer a fix
    { ok:false, conflicts }                -> say someone else edited it; retry
- To change ONE existing transaction, use updates (NOT delete+create) —
  updates preserve id. Before any update/delete, call ledger_search or
  ledger_get to fetch the real id and raw_text. Never guess ids.
- Batch related edits into one ledger_apply (split = 1 update + 1 create).
- Beancount format: \`YYYY-MM-DD * "payee" "narration"\` on line 1, postings
  indented 4 spaces: \`<Account>  <amount> <CCY>\`. Top-level account MUST be
  one of Assets, Liabilities, Income, Expenses, Equity. Credit cards are
  liabilities: \`Liabilities:CC:<Issuer>\` (HSBC, Axis, HDFC, …). If you do
  not know the issuer, ask the user or look it up — never invent one.
- Postings must sum to zero within each currency.
- Cashback on a CC purchase (user's convention): for a purchase of P with
  cashback C on <Issuer>, use three postings:
    Expenses:<Category>        P.00 INR
    Income:Cashback           -C.00 INR
    Liabilities:CC:<Issuer>  -(P-C).00 INR
  The expense stays at sticker price; the CC is charged only the net.
- Keep replies terse. Show 5-10 rows max unless asked for more.

Search syntax for ledger_search (q param):
- @account  (e.g. @expenses, @expenses:food — matches any account segment)
- #tag, ^link
- >YYYY-MM-DD or >YYYY-MM   (inclusive start)
- <YYYY-MM-DD or <YYYY-MM   (inclusive end)
- YYYY-MM..YYYY-MM           (date range)
- free words are ANDed full-text match against raw_text. Use them ONLY for
  specific payees/merchants. Never pass filler words like "all", "this",
  "month", "by", "category", "orders", "expenses" — those either filter to
  zero or duplicate an @account filter.
Examples:
  "all expenses this month"      -> q: ">2026-04-01 <2026-04-30 @expenses"
  "swiggy in march 2026"         -> q: ">2026-03-01 <2026-03-31 swiggy"
  "food spend in april 2026"     -> q: ">2026-04-01 <2026-04-30 @expenses:food"
  "transactions this month"      -> q: ">2026-04-01 <2026-04-30"
When the user asks for a breakdown/aggregation (e.g. "by category"), run a
broad search first (date range + @expenses), then group the results yourself
in the reply — the tool does not aggregate.`
}

export class ChatAgent extends AIChatAgent<Cloudflare.Env> {
  maxPersistedMessages = 100

  async onChatMessage(
    _onFinish: unknown,
    options?: OnChatMessageOptions,
  ): Promise<Response | undefined> {
    try {
      return await this._onChatMessage(_onFinish, options)
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e)
      console.error('[chat] top-level throw', msg)
      throw e
    }
  }

  async _onChatMessage(
    _onFinish: unknown,
    options?: OnChatMessageOptions,
  ): Promise<Response | undefined> {
    const email = this.name
    if (!email || !email.includes('@')) {
      return new Response('ChatAgent instance must be keyed by user email', { status: 400 })
    }

    const provider = createOpenAICompatible({
      name: 'cf-ai-gateway-nim',
      baseURL: `https://gateway.ai.cloudflare.com/v1/${this.env.CLOUDFLARE_ACCOUNT_ID}/${this.env.AI_GATEWAY_NAME}/custom-nvidia-nim`,
      headers: {
        'cf-aig-authorization': `Bearer ${this.env.CF_AIG_TOKEN}`,
      },
    })

    const tools = buildLedgerTools(this.env, email)

    const kimiMiddleware = createToolMiddleware({
      protocol: kimiProtocol(),
      toolSystemPromptTemplate: (toolList) =>
        `You have access to the following tools. When you decide to call a tool, emit the call using Kimi's native tool-call tokens only (no python code blocks). Exact format per call:\n<|tool_calls_section_begin|><|tool_call_begin|>functions.<name>:0<|tool_call_argument_begin|>{"arg":"value"}<|tool_call_end|><|tool_calls_section_end|>\n\nAvailable tools:\n${toolList
          .map(
            (t) =>
              `- ${t.name}: ${t.description ?? ''}\n  parameters: ${JSON.stringify(t.inputSchema)}`,
          )
          .join('\n')}`,
      toolResponsePromptTemplate: (toolResult) => {
        const out = toolResult.output
        const body =
          typeof out === 'string'
            ? out
            : JSON.stringify(
                (out as { type?: string; value?: unknown })?.value ?? out,
              )
        return `<|tool_result_begin|>${toolResult.toolName}:${toolResult.toolCallId}<|tool_result_argument_begin|>${body}<|tool_result_end|>`
      },
    })

    const wrappedModel = wrapLanguageModel({
      model: provider.chatModel(this.env.CHAT_MODEL),
      middleware: kimiMiddleware,
    })

    const uiMessages = this.messages as UIMessage[]
    console.log('[chat] ui-in count=', uiMessages.length)
    for (let i = 0; i < uiMessages.length; i++) {
      const m = uiMessages[i]
      const parts = (m.parts ?? []) as Array<{
        type?: string
        state?: string
        toolCallId?: string
      }>
      const summary = parts
        .map((p) => {
          if (typeof p?.type === 'string' && p.type.startsWith('tool-')) {
            return `${p.type}{state=${p.state ?? '?'},id=${p.toolCallId ?? '?'}}`
          }
          return p?.type ?? 'unknown'
        })
        .join(',')
      console.log(`[chat] ui[${i}] role=${m.role} parts=[${summary}]`)
    }
    const resolved = resolveStalePendingTools(uiMessages)
    if (resolved.changed) {
      console.log('[chat] resolved stale pending tool parts → persisting')
      await this.persistMessages(resolved.messages)
    } else {
      console.log('[chat] no stale pending tool parts')
    }
    const converted = await convertToModelMessages(resolved.messages)
    const modelMessages = patchOrphanToolCalls(converted)
    console.log('[chat] msgs-count', modelMessages.length)
    for (let i = 0; i < modelMessages.length; i++) {
      const m = modelMessages[i]
      console.log(`[chat] msg[${i}] role=${m.role}`, JSON.stringify(m.content).slice(0, 600))
    }
    console.log('[chat] tools', Object.keys(tools).join(','))

    const result = streamText({
      model: wrappedModel,
      system: buildSystemPrompt(),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(10),
      abortSignal: options?.abortSignal,
      onError: (e) => {
        console.error('[chat] streamText onError', e)
      },
    })

    return result.toUIMessageStreamResponse({
      onError: (e) => {
        const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
        console.error('[chat] toUIMessageStreamResponse onError', msg)
        return msg
      },
    })
  }
}
