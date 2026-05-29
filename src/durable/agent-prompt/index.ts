// System-prompt fragments for the AI agent. The .md files alongside this
// module are the source of truth — they're codegen'd into inline.generated.ts
// by scripts/build-agent-prompt.mjs, which runs automatically before build
// and deploy. Edit the .md files, not the generated one.

import {
  BEANCOUNT_PRIMER,
  TOOL_RULES,
  EXAMPLES,
  CLARIFICATIONS,
  STATEMENT_HANDLING,
  STATEMENT_EXTRACTION,
} from './inline.generated'

export { BEANCOUNT_PRIMER }

type Snapshot = {
  today: number
  accounts: Array<{ account: string; currencies: string[]; close_date: number | null }>
}

function isoToday(today: number): string {
  return `${Math.floor(today / 10000)}-${String(Math.floor((today % 10000) / 100)).padStart(2, '0')}-${String(today % 100).padStart(2, '0')}`
}

function renderAccounts(snapshot: Snapshot): string {
  return snapshot.accounts
    .filter((a) => a.close_date == null)
    .map((a) => {
      const ccys = a.currencies.length ? ` [${a.currencies.join(',')}]` : ''
      return `- ${a.account}${ccys}`
    })
    .join('\n')
}

function renderSnapshotBlock(snapshot: Snapshot): string {
  return `# Ledger context

- Today: ${isoToday(snapshot.today)}
- Open accounts (use these — don't invent new ones unless none fits):
${renderAccounts(snapshot) || '- (none yet)'}`
}

// Ledger (general editor) agent: handles freeform Beancount edits. It does NOT
// process statement uploads itself — it hands those to the statement
// specialist (see HANDOFF_TO_STATEMENT). So STATEMENT_HANDLING is omitted here.
const HANDOFF_TO_STATEMENT = `# Statement uploads — hand off

A user message may contain a self-closing reference like:

\`\`\`
<statement id="STMT-abc123…" filename="hsbc-jan.pdf" />
\`\`\`

You do NOT process statements yourself. The moment a message references one (or
the user clearly wants a statement turned into transactions), call
\`handoff({ to: "statement", context })\`. Put the exact statement id(s) and any
inline instructions the user gave ("skip Amazon refunds", "ignore the small
ones") into \`context\`. The statement specialist then owns the conversation —
it extracts, clarifies if needed, and drafts. Do NOT call \`process_statement\`
or \`draft_transaction\` for an upload yourself.`

// Statement specialist agent: owns the conversation after a handoff, drives the
// extraction worker, clarifies, and drafts. STATEMENT_HANDLING carries the
// process_statement flow; HANDOFF_BACK tells it to return control when done.
const STATEMENT_AGENT_ROLE = `# You are the statement specialist

The conversation was handed to you to turn an uploaded statement into reviewed
transactions. Drive that to completion: process the statement, clarify any
genuinely ambiguous accounting choice, then draft the transactions for approval.`

const HANDOFF_BACK = `# Returning control

When the statement work is done (drafted, or nothing to extract, or failed) and
the user's next message is NOT about this statement, hand the conversation back
with \`handoff({ to: "ledger", context })\`, summarizing what was done in
\`context\`. While statement work is still in progress, stay in control.`

export function buildSystemPrompt(snapshot: Snapshot): string {
  return [
    BEANCOUNT_PRIMER,
    TOOL_RULES,
    EXAMPLES,
    CLARIFICATIONS,
    STATEMENT_HANDLING,
    renderSnapshotBlock(snapshot),
  ].join('\n\n---\n\n')
}

// System prompt for the `ledger` agent in the handoff-based editor registry.
export function buildLedgerSystem(snapshot: Snapshot): string {
  return [
    BEANCOUNT_PRIMER,
    TOOL_RULES,
    EXAMPLES,
    CLARIFICATIONS,
    HANDOFF_TO_STATEMENT,
    renderSnapshotBlock(snapshot),
  ].join('\n\n---\n\n')
}

// System prompt for the `statement` specialist agent.
export function buildStatementAgentSystem(snapshot: Snapshot): string {
  return [
    BEANCOUNT_PRIMER,
    EXAMPLES,
    CLARIFICATIONS,
    STATEMENT_AGENT_ROLE,
    STATEMENT_HANDLING,
    HANDOFF_BACK,
    renderSnapshotBlock(snapshot),
  ].join('\n\n---\n\n')
}

// Static system prompt for the one-shot statement-extraction subagent. It sees
// only the raw statement text plus the ledger context — never the main chat
// history. This deliberately holds NO per-request data: it must stay byte-
// identical across every statement and user so Workers AI prefix-caching can
// reuse the prefill. The dynamic ledger context (today, filename, accounts)
// goes in the user message via buildExtractionContextBlock — putting it here
// would change the prefix on every request and defeat the cache.
export function buildStatementExtractionPrompt(): string {
  return [BEANCOUNT_PRIMER, EXAMPLES, STATEMENT_EXTRACTION].join('\n\n---\n\n')
}

// Per-request ledger context, prepended to the statement text in the user
// message. Kept out of the system prompt so the cacheable prefix stays stable.
export function buildExtractionContextBlock(
  snapshot: Snapshot,
  filename: string,
): string {
  return `# Ledger context

- Today: ${isoToday(snapshot.today)}
- Statement filename: ${filename}
- Open accounts (use these — don't invent new ones unless none fits):
${renderAccounts(snapshot) || '- (none yet)'}`
}
