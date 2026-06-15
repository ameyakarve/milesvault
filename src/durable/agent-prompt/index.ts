// System-prompt fragments for the AI agent. The .md files alongside this
// module are the source of truth — they're codegen'd into inline.generated.ts
// by scripts/build-agent-prompt.mjs, which runs automatically before build
// and deploy. Edit the .md files, not the generated one.

import {
  BEANCOUNT_PRIMER,
  LEDGER_RULES,
  TOOL_RULES,
  EXAMPLES,
  CLARIFICATIONS,
  STATEMENT_HANDLING,
  STATEMENT_EXTRACTION,
  STATEMENT_TEXT,
  ANALYST_ROLE,
  GRAPH_WALKER_ROLE,
} from './inline.generated'

export { BEANCOUNT_PRIMER }
// Domain-specific clarify scenarios (when/what to ask). Passed to `clarifyTool`
// at construction — the clarify tool's CORE is generic; this is the ledger
// domain's knowledge of which choices warrant a question. Not part of the
// interactive system prompts anymore (it travels with the tool that uses it).
export { CLARIFICATIONS }

type Snapshot = {
  today: number
  accounts: Array<{ account: string; currencies: string[]; close_date: number | null }>
}

type AnalystSnapshot = Snapshot & {
  row_counts: Record<string, number>
  sample_txns: string
  schema_ddl: string
}

function isoToday(today: number): string {
  return `${Math.floor(today / 10000)}-${String(Math.floor((today % 10000) / 100)).padStart(2, '0')}-${String(today % 100).padStart(2, '0')}`
}

function renderAccounts(snapshot: Snapshot, aliases?: Record<string, string>): string {
  return snapshot.accounts
    .filter((a) => a.close_date == null)
    .map((a) => {
      const ccys = a.currencies.length ? ` [${a.currencies.join(',')}]` : ''
      const aka = aliases?.[a.account] ? ` — ${aliases[a.account]}` : ''
      return `- ${a.account}${ccys}${aka}`
    })
    .join('\n')
}

function renderSnapshotBlock(snapshot: Snapshot, aliases?: Record<string, string>): string {
  return `# Ledger context

- Today: ${isoToday(snapshot.today)}
- Open accounts — use these; don't invent new ones unless none fits. The names
  after "—" are what each account is also known by; match the words in the
  user's request against them to pick the account they mean:
${renderAccounts(snapshot, aliases) || '- (none yet)'}`
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
it extracts, clarifies if needed, and drafts. Do NOT call \`read_statement\`
or \`draft_transaction\` for an upload yourself.`

// Statement specialist agent: owns the conversation after a handoff, reads the
// statement text inline via read_statement, clarifies, and drafts.
// STATEMENT_HANDLING carries the read_statement flow; STATEMENT_EXTRACTION the
// output rules; HANDOFF_BACK tells it to return control when done.
const STATEMENT_AGENT_ROLE = `# You are the statement specialist

The conversation was handed to you to turn an uploaded statement into reviewed
transactions. Drive that to completion: read the statement, clarify any
genuinely ambiguous accounting choice, then draft the transactions for approval.`

const HANDOFF_BACK = `# Returning control

Once you have finished the statement work — drafted the transactions, found
nothing to extract, or failed — your job is done. Stay in control ONLY while
that work is still unfinished (mid-extraction, or you still owe a clarification
or a draft).

After it's done, returning to \`ledger\` is the DEFAULT. On the user's next
message, hand the conversation back with \`handoff({ to: "ledger", context })\`,
summarizing what was done in \`context\` — UNLESS that message is a direct
correction or follow-up to the statement you just handled (e.g. "fix the date
on the Amazon row"), in which case handle it first, then hand back.`

// Read-only SQL is how the editor ANSWERS questions about existing entries
// ("which of my Accor txns are redemptions?") — it reads its own ledger rather
// than asking the user to paste. Changes still go through draft_transaction, never SQL.
function renderQueryBlock(ddl: string): string {
  return `# Answering questions about existing entries (read-only SQL)

ANSWER questions about what's already in the ledger — "which of my X are
redemptions?", "how much did I spend on Y?", "find my Z" — by reading it
yourself with \`query_sql\` (SELECT/WITH only); never tell the user you can't see
their data or ask them to paste it. (To ADD/EDIT/DELETE, use \`draft_transaction\`.)

Writing the WHERE clause: when the question is about a programme, currency,
card, or brand, its rows live in that ACCOUNT — find it in the list above
(aliases after "—") and filter \`p.account\`, not the row text. E.g. for a
question about "Skyline" when the list shows
\`Assets:Rewards:Points:Skyline — Skyline Rewards\`:

\`\`\`
✓  WHERE p.account = 'Assets:Rewards:Points:Skyline'
✗  WHERE t.payee LIKE '%Skyline%' OR t.narration LIKE '%Skyline%'
\`\`\`

The ✗ misses rows — a programme's spends carry the MERCHANT (a hotel, a flight),
never the programme name. Filter by the account.

Select narrow columns with a \`LIMIT\`, against the schema below.

\`\`\`sql
${ddl.trim()}
\`\`\``
}

// System prompt for the `ledger` agent in the handoff-based editor registry.
export function buildLedgerSystem(
  snapshot: Snapshot & { schema_ddl?: string },
  aliases?: Record<string, string>,
): string {
  // CLARIFICATIONS is NOT here — it's domain hints for the clarify tool, passed
  // at construction (see clarifyTool). Keeps the generic mechanism and its
  // domain triggers from getting tangled in the system prompt.
  return [
    BEANCOUNT_PRIMER,
    LEDGER_RULES,
    TOOL_RULES,
    EXAMPLES,
    HANDOFF_TO_STATEMENT,
    renderSnapshotBlock(snapshot, aliases),
    snapshot.schema_ddl?.trim() ? renderQueryBlock(snapshot.schema_ddl) : '',
  ]
    .filter(Boolean)
    .join('\n\n---\n\n')
}

// The convention stack the incorporation shard authors against — the same
// primer + rules + examples the statement extractor uses (the shard does the
// same job: produce correct beancount). No snapshot/handoff/tool sections.
export function buildIncorporationConventions(): string {
  return [BEANCOUNT_PRIMER, LEDGER_RULES, EXAMPLES].join('\n\n---\n\n')
}

// System prompt for the headless ingest pipeline's extraction call: the
// SAME convention stack the editor's statement agent runs on (primer,
// examples, clarifications, extraction rules) — the only delta is the
// output channel (STATEMENT_TEXT: a JSON envelope of beancount entries
// instead of a tool call). One source of conventions; never fork prompts
// per surface.
export function buildStatementTextSystem(): string {
  return [
    BEANCOUNT_PRIMER,
    LEDGER_RULES,
    EXAMPLES,
    CLARIFICATIONS,
    STATEMENT_EXTRACTION,
    STATEMENT_TEXT,
  ].join('\n\n---\n\n')
}

// System prompt for the `statement` specialist agent.
export function buildStatementAgentSystem(snapshot: Snapshot): string {
  // CLARIFICATIONS travels with the clarify tool (passed at construction), not
  // in this prompt — see clarifyTool / buildLedgerSystem.
  return [
    BEANCOUNT_PRIMER,
    LEDGER_RULES,
    EXAMPLES,
    STATEMENT_AGENT_ROLE,
    STATEMENT_HANDLING,
    STATEMENT_EXTRACTION,
    HANDOFF_BACK,
    renderSnapshotBlock(snapshot),
  ].join('\n\n---\n\n')
}

// Fuller snapshot block for the analyst: it writes SQL, so it needs the
// schema DDL and a few sample transactions to anchor on the data shape.
function renderAnalystSnapshotBlock(snapshot: AnalystSnapshot): string {
  const counts = Object.entries(snapshot.row_counts)
    .map(([t, n]) => `  ${t}: ${n}`)
    .join('\n')
  return `# Ledger context

- Today: ${isoToday(snapshot.today)}
- Open accounts (cite these by exact name):
${renderAccounts(snapshot) || '- (none yet)'}

## Schema

\`\`\`sql
${snapshot.schema_ddl.trim()}
\`\`\`

## Row counts

${counts || '  (empty)'}

## A few real transactions for shape reference

${snapshot.sample_txns.trim() || '(no transactions yet)'}`
}

// Handoff teaching for the Concierge surface. The analyst owns ledger
// questions; the graph-walker owns the points & miles knowledge graph
// (cards, programmes, transfer partners, alliances). Either can hand the
// conversation to the other when the question shifts domain.
const HANDOFF_TO_GRAPH_WALKER = `# Knowledge-graph questions — hand off

If the user is asking about credit cards, loyalty programmes, transfer
partners, airline alliances, hotel chains, or anything else about the points
& miles world IN GENERAL (i.e. not about their own ledger numbers), you do
NOT have that data. Hand off to the graph-walker:

\`\`\`
handoff({ to: "graph-walker", context: "<the user's question, plus any
constraint they mentioned>" })
\`\`\`

Examples that belong to the graph-walker: "which cards transfer to Turkish
Airlines?", "what's the Marriott → United transfer ratio?", "which Indian
banks issue Amex?", "what hotels are in Hyatt's portfolio?".

Do NOT try to answer these from the ledger — the ledger only records the
user's transactions, not the universe of cards and programmes.`

const HANDOFF_TO_ANALYST = `# When to hand off to the analyst

You have ledger access via \`codemode.ledger_snapshot({})\` and
\`codemode.query_sql({ sql })\` — handle cross-domain questions yourself.
"Which of MY cards transfer to Turkish?" or "Do I have enough Avios for X?"
are graph-walker questions — call \`ledger_snapshot\` to read the user's
account list, then walk the graph alongside it in one program.

ONLY hand off to the analyst when the question is purely about the user's
ledger with no graph component at all — e.g. "how much did I spend on
flights last month?", "show me my Marriott stays in 2026", "what's my
average monthly spend?". Those are pure SQL aggregations over the user's
postings; the analyst's prompt is shaped for that shallow numeric work.

\`\`\`
handoff({ to: "analyst", context: "<the user's question>" })
\`\`\`

If in doubt — if the question touches both card-or-currency knowledge AND
the user's own data — handle it yourself. That's the whole point of the
cross-domain tool surface.`

// System prompt for the `analyst` agent (Concierge surface). Read-only Q&A
// over the ledger via SQL — no Beancount editing, no statement handling.
export function buildAnalystSystem(snapshot: AnalystSnapshot): string {
  return [
    ANALYST_ROLE,
    HANDOFF_TO_GRAPH_WALKER,
    BEANCOUNT_PRIMER,
    renderAnalystSnapshotBlock(snapshot),
  ].join('\n\n---\n\n')
}

// System prompt for the `graph-walker` agent (Concierge surface). Read-only
// traversal of the milesvault knowledge graph via the kb HTTP API. The
// `agentsBriefing` is the live `/api/kb/agents.md` document (schema + counts),
// fetched per turn so the agent sees the current type vocabulary.
export function buildGraphWalkerSystem(agentsBriefing: string): string {
  return [
    GRAPH_WALKER_ROLE,
    HANDOFF_TO_ANALYST,
    '# Live graph schema',
    agentsBriefing.trim(),
  ].join('\n\n---\n\n')
}
