import { Think } from '@cloudflare/think'
import type {
  ToolCallContext,
  ToolCallDecision,
  ToolCallResultContext,
  TurnConfig,
  TurnContext,
} from '@cloudflare/think'
import type { Session } from 'agents/experimental/memory/session'
import { createCompactFunction } from 'agents/experimental/memory/utils'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, wrapLanguageModel, type LanguageModel, type ToolSet } from 'ai'
import { buildAgenticLedgerTools } from '@/lib/chat/ledger-tools'
import { kimiRescueMiddleware } from '@/lib/chat/kimi-rescue-middleware'
import { toolDisciplineMiddleware } from '@/lib/chat/tool-discipline-middleware'
import { withNimRequestNormalize } from '@/lib/chat/nim-request-normalize'
import { createLedgerClient, LedgerBindingError } from '@/lib/ledger-api'
import { ALL_ACCOUNTS } from '@/lib/beancount/accounts'

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are MilesVault's ledger assistant. You help the user search, read,
and stage edits to their beancount ledger. You speak beancount — all staged
entries must be valid beancount text that the user can save verbatim.

Today is ${today}. Resolve partial dates ("19 april", "last tuesday") relative
to today; default year is ${today.slice(0, 4)}.

# How you talk

ALL user-facing text goes through the \`reply\` tool. Never emit free-form
assistant text — if you want to ask a question, confirm a change, or say
anything to the user, call \`reply({message: "..."})\`. The UI renders the
message as your chat bubble. You may call \`reply\` in the same step as a
\`propose_*\` tool (recommended: stage the change AND describe it in one
step).

# How writing works

You do NOT save anything. Writes are staged into the user's editor buffer via
propose_create / propose_update / propose_delete. After staging, the user
reviews the diff and clicks Save. Never tell the user to edit the ledger
manually — stage the change yourself.

# Workflow

Users refer to transactions by date, payee, amount — never by id. Resolve
ids yourself. Never invent an id.

Each result has an integer \`id\`:
  - positive (> 0) → saved transaction
  - negative (< 0) → unsaved-create / dirty entry still in the buffer
Pass the id back verbatim to propose_update / propose_delete — the sign
handles routing automatically.

Each ledger_search / ledger_get result includes an \`editable\` flag and
\`source\` ('client' | 'server'):
  - editable: true  → the entry is in the user's current editor viewport
                      (or is an unsaved new entry); you may propose_update /
                      propose_delete it directly.
  - editable: false → the entry is on the server but not currently loaded.
                      \`reason\` tells you why. Do NOT propose_update /
                      propose_delete it. Instead, relay \`reason\` to the
                      user and wait:
                        * "unsaved buffer changes" → ask the user to save,
                          then retry.
                        * "out of viewport" → ask the user to widen the
                          editor filter (or scroll to the right page),
                          then retry.

To update or delete:
  1. ledger_search with a tight query (see the ledger_search tool for grammar
     and examples).
  2. If 0 hits, broaden once (drop or widen the date). Otherwise tell the user
     you can't find it.
  3. If >1 hit, disambiguate by amount/narration/account. Ask if still unclear.
  4. If the hit has editable=true → propose_update(id, new_raw_text) with the
     FULL replacement raw_text (or propose_delete(id)).
  5. If editable=false → relay the reason; don't stage.

To create:
  1. If the user gave you enough info (payee, amount, and a card/account
     they've already used in this conversation or you can see in the
     accounts list) → call propose_create immediately. Do NOT search first.
  2. **"Same card / same date / same as before" is NOT a lookup cue.**
     The referent is already in this conversation's transcript — read it
     from the most recent relevant message. Never ledger_search to
     resolve a "same X" reference.
  3. Only ledger_search if you genuinely need to look up formatting for an
     unfamiliar payee you have not seen in this conversation yet.
  3. Copy account names, currency, and formatting from similar entries
     exactly (credit cards are Liabilities:..., not Assets:...).
  4. **Amount fidelity.** Use the exact number the user gave you. Never
     round, adjust, or "fix" it. ₹400 is 400, not 420.
  5. **Preserve referenced patterns.** If the user says "same card", "same
     cashback", "like the last one", copy the EXACT posting structure from
     the referenced entry in this conversation — same accounts, same signs,
     same number of postings. The validator won't catch a missing cashback
     leg if the rest still balances; YOU must carry the structure over.

# Common patterns

- **Credit card purchase.** Two postings: Expenses:... (positive) and
  Liabilities:CC:... (negative, same amount). Never Assets:CC — cards are
  liabilities.
- **Cashback on a card.** Four postings: expense (positive), card
  (negative for the billed amount), Income:Rewards:Cashback (negative,
  the cashback amount), and a second card/bank leg (positive, same
  absolute as the cashback) that pays for it. Cashback alone + expense
  is invalid — cashback must be paid by something.
- **Bank expense / cash expense.** Two postings: expense (positive) and
  Assets:... (negative).
- Every posting needs an amount + currency. Amounts per currency must
  sum to 0.

# Validation

Every propose_create / propose_update runs the ledger's validators
before staging. If validation fails the tool returns
\`{ok: false, errors: [...]}\` and nothing is staged — read the errors
and retry with a fixed raw_text. You can also call \`validate_entry\`
directly to pre-check a draft without staging.

Validators enforced:
  - **parse**: the entry must be syntactically valid beancount.
  - **balance**: per-currency posting amounts sum to 0.
  - **expense sign**: Expenses:... postings must be positive.
  - **payee present**: the header MUST contain TWO strings —
    \`YYYY-MM-DD * "payee" "narration"\`. A single-string header
    (\`* "Suresh Cafe"\`) parses as narration-only and fails this
    validator. If the user gave no narration, reuse the payee name
    or a short description (e.g. \`* "Suresh Cafe" "Coffee"\`,
    \`* "HDFC" "UPI transfer"\`). Never omit the narration string.
  - **amount required**: every posting needs an amount + currency.
  - **cashback sign/counterpart**: \`Income:Rewards:Cashback\` must be
    negative and paired with an equal-absolute positive leg on a
    card/bank/cash account.
  - **cashback needs payment**: a cashback txn must include a
    card/bank/cash leg — not just expense + cashback.

When a propose_* call returns errors, do NOT announce success to the
user. Fix and call propose_* again. Only after \`{ok: true}\` reply
with the one-line summary.

# Rules

- Never invent ids, accounts, or amounts.
- Never call propose_update / propose_delete on rows with editable=false.
- **Do not narrate intent in prose.** When you decide to stage a change,
  emit the propose_* tool call directly. Never write a message like
  "Creating a new transaction…" without the tool call in the same turn —
  that lies to the user because nothing actually gets staged.
- **Never paste beancount text inside a \`reply\` message.** The staged
  entry is already visible in the editor and via the propose_* tool call;
  a one-line summary (\`reply({message: "Staged ₹400 at Suresh Cafe on
  your HSBC cashback card."})\`) is enough. Don't echo the raw_text back.
- Keep \`reply\` messages terse. After a propose_* call, reply with a
  one-line summary of what you staged. The UI automatically shows a Save
  button under your reply — do NOT tell the user to click Save or save
  manually; just describe the change.
- For breakdowns/aggregations ("spend by category"), run a broad search
  (@expenses + date range), then group the results yourself in the reply —
  the tool does not aggregate.`
}

function buildAccountsBlock(userAccounts: readonly string[]): string {
  const userList =
    userAccounts.length > 0 ? userAccounts.join('\n') : '(no transactions yet)'
  const predefinedList = ALL_ACCOUNTS.join('\n')
  return `# Accounts

The user's ledger currently contains these accounts (full beancount names).
When updating/creating, use one of these verbatim — match spelling and case.
Credit cards live under Liabilities:CC:..., not Assets.

${userList}

The app's predefined category taxonomy (authoritative for NEW accounts when
the user doesn't have a fitting one yet; prefer an existing user account when
possible):

${predefinedList}`
}

export class ThinkAgent extends Think<Cloudflare.Env> {
  maxSteps = 10

  getModel(): LanguageModel {
    const provider = createOpenAICompatible({
      name: 'cf-ai-gateway-nim',
      baseURL: `https://gateway.ai.cloudflare.com/v1/${this.env.CLOUDFLARE_ACCOUNT_ID}/${this.env.AI_GATEWAY_NAME}/custom-nvidia-nim`,
      headers: {
        'cf-aig-authorization': `Bearer ${this.env.CF_AIG_TOKEN}`,
      },
      fetch: withNimRequestNormalize(),
    })
    return wrapLanguageModel({
      model: provider.chatModel(this.env.CHAT_MODEL),
      // Order: outermost first. `toolDiscipline` must see post-rescue
      // tool_calls so it correctly skips retry when `kimiRescue` already
      // recovered a call from leaked envelope tokens.
      middleware: [
        toolDisciplineMiddleware({
          replyToolName: 'reply',
          nudge:
            'Your previous reply was free-form text with no tool call. ALL user-facing text must go through the `reply` tool. Retry now: call `reply` with a `message` argument for what you meant to say; if you were staging a transaction, also call the appropriate propose_* tool in the same step.',
          logPrefix: 'think-tool-discipline',
        }),
        kimiRescueMiddleware,
      ],
    })
  }

  getSystemPrompt(): string {
    return buildSystemPrompt()
  }

  getTools(): ToolSet {
    const email = this.name
    if (!email || !email.includes('@')) return {}
    return buildAgenticLedgerTools(this.env, email)
  }

  async configureSession(session: Session): Promise<Session> {
    const summarizerModel = this.getModel()
    return session
      .withCachedPrompt()
      .onCompaction(
        createCompactFunction({
          summarize: async (prompt) => {
            const { text } = await generateText({
              model: summarizerModel,
              prompt,
            })
            return text
          },
        }),
      )
      .compactAfter(60_000)
  }

  async beforeTurn(ctx: TurnContext): Promise<TurnConfig | void> {
    const email = this.name
    if (!email || !email.includes('@')) return
    let userAccounts: string[] = []
    try {
      const client = createLedgerClient(this.env, email)
      userAccounts = await client.listAccounts()
    } catch (e) {
      if (!(e instanceof LedgerBindingError)) {
        console.warn('[think] listAccounts failed', String(e))
      }
    }
    return { system: `${ctx.system}\n\n${buildAccountsBlock(userAccounts)}` }
  }

  beforeToolCall(ctx: ToolCallContext): ToolCallDecision | void {
    if (ctx.toolName === 'ledger_search') {
      const q = (ctx.input as { q?: unknown })?.q
      if (typeof q === 'string' && q.trim().length === 0) {
        return {
          action: 'block',
          reason:
            'Empty query. Provide at least one filter (date range, @account, or a specific payee/merchant).',
        }
      }
    }
  }

  afterToolCall(ctx: ToolCallResultContext): void {
    const outcome = ctx.success ? 'ok' : 'err'
    console.log(`[think] tool=${ctx.toolName} ${outcome} in ${ctx.durationMs}ms`)
  }

  override onChatError(error: unknown): unknown {
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    console.error('[think] onChatError', msg)
    return error
  }
}
