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
  CONCIERGE_ROLE,
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

✓  search({ accounts: { prefix: ["Assets:Rewards:Skyline"] }, sign: "credit" })

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

// System prompt for the single Concierge agent. One agent over BOTH domains —
// the milesvault knowledge graph (cards, programmes, transfer partners,
// alliances) and the user's own ledger (via query_sql / ledger_snapshot). No
// handoff, no codemode: the agent holds all the read tools at once. The
// `agentsBriefing` is the live `/api/kb/agents.md` document (schema + counts),
// fetched per turn so the agent sees the current type vocabulary.
export function buildConciergeSystem(
  snapshot: AnalystSnapshot,
  agentsBriefing: string,
  programmes: Array<{ slug: string; name: string }> = [],
  cards: Array<{ slug: string; name: string }> = [],
): string {
  return [
    CONCIERGE_ROLE,
    BEANCOUNT_PRIMER,
    renderAnalystSnapshotBlock(snapshot),
    programmes.length || cards.length ? renderSlugCatalog(programmes, cards) : null,
    '# Live graph schema',
    agentsBriefing.trim(),
  ]
    .filter((x): x is string => !!x)
    .join('\n\n---\n\n')
}

// The closed set of valid slugs. The 26B model truncates/invents slugs when it
// free-generates them (`program/av`, `program/mar-bon`); handing it the exact
// list to copy from fixes that. Programmes are the usual `/points?target=` value;
// cards are valid targets too (book-from anchor) and are cited for card
// questions — so both are listed, not just currencies.
function renderSlugCatalog(
  programmes: Array<{ slug: string; name: string }>,
  cards: Array<{ slug: string; name: string }>,
): string {
  const fmt = (xs: Array<{ slug: string; name: string }>) =>
    xs.map((x) => `- ${x.name} — \`${x.slug}\``).join('\n')
  const blocks: string[] = [
    `# Valid slugs — copy these EXACTLY (never abbreviate or invent)

When you build a \`/points?target=…\` link or cite a slug, copy it verbatim from
this catalog — \`program/avios\`, never \`program/av\`; \`program/marriott-bonvoy\`,
never \`program/mar-bon\`. If what the user named isn't here, say so.`,
  ]
  if (programmes.length)
    blocks.push(`## Programmes — the usual \`/points?target=\` value\n\n${fmt(programmes)}`)
  if (cards.length)
    blocks.push(
      `## Cards — also a valid \`/points\` target in book-from mode (\`?target=<cc/slug>&dir=from\`)\n\n${fmt(cards)}`,
    )
  return blocks.join('\n\n')
}
