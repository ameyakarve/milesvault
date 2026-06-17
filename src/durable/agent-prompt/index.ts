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

// How the editor finds + reads its own entries: `search` (structured find) →
// `get_entry` (read one) → `draft_transaction`. No query_sql in the editor —
// finding is search's job; analytics lives on the concierge/analyst surface.
const SEARCH_GUIDANCE = `# Reading existing entries — use \`search\`

To FIND entries (to read, edit, or attribute), use \`search\` — a structured
lookup over the ledger. Resolve a programme/card/brand to its ACCOUNT from the
list above (aliases after "—"), then filter by \`accounts.prefix\`; add \`sign\`
("debit" = negative, "credit" = positive), \`date\`, \`currencies\`, or \`payee_q\`
(full-text over payee + narration) as needed. ONE \`search\` call returns the
matching rows with their \`txn_id\` — read the full entry with \`get_entry\` (kind
"txn"), then edit/delete via \`draft_transaction\`. Don't probe with the display
name: a programme's rows live in its ACCOUNT, not its text (its spends carry the
MERCHANT — a hotel, a flight — never the programme name).

✓  search({ accounts: { prefix: ["Assets:Rewards:Points:Skyline"] }, sign: "credit" })

Once a \`search\` returns the rows you need, STOP searching and act — read with
\`get_entry\` and draft. Never tell the user you can't see their data or ask them
to paste it.`

// System prompt for the `ledger` agent in the handoff-based editor registry.
export function buildLedgerSystem(
  snapshot: Snapshot & { schema_ddl?: string },
  aliases?: Record<string, string>,
  opts?: { statement?: boolean },
): string {
  // CLARIFICATIONS is NOT here — it's domain hints for the clarify tool, passed
  // at construction (see clarifyTool). Keeps the generic mechanism and its
  // domain triggers from getting tangled in the system prompt.
  // The statement shards (handling + extraction rules: pad+balance closings,
  // "assert the card's closing balance", forex folding) are included ONLY when
  // the turn actually involves a statement — they'd otherwise leak statement
  // framing into plain edits (add/edit/delete/refund). The dedicated ingest path
  // (ChatDO.runDraftStatement) passes `statement: true` explicitly; the editor
  // turn only gates them in for the UI-only convenience case (a pasted statement
  // chip, via turnInvolvesStatement) — statement ingest is NOT an editor feature.
  return [
    BEANCOUNT_PRIMER,
    LEDGER_RULES,
    TOOL_RULES,
    EXAMPLES,
    ...(opts?.statement ? [STATEMENT_HANDLING, STATEMENT_EXTRACTION] : []),
    renderSnapshotBlock(snapshot, aliases),
    SEARCH_GUIDANCE,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n')
}

// A turn "involves a statement" when the message carries the editor's statement
// chip (`<statement id="STMT-…"/>`) or plainly references one. Used to gate the
// statement shards above into the prompt only when relevant.
export function turnInvolvesStatement(text: string): boolean {
  return text.includes('<statement id="STMT-') || /\bstatement\b/i.test(text)
}

// The convention stack the incorporation shard authors against — the same
// primer + rules + examples the statement extractor uses (the shard does the
// same job: produce correct beancount). No snapshot/handoff/tool sections.
export function buildIncorporationConventions(): string {
  return [BEANCOUNT_PRIMER, LEDGER_RULES, EXAMPLES].join('\n\n---\n\n')
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
