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

export function buildSystemPrompt(snapshot: Snapshot): string {
  const snapshotBlock = `# Ledger context

- Today: ${isoToday(snapshot.today)}
- Open accounts (use these — don't invent new ones unless none fits):
${renderAccounts(snapshot) || '- (none yet)'}`

  return [
    BEANCOUNT_PRIMER,
    TOOL_RULES,
    EXAMPLES,
    CLARIFICATIONS,
    STATEMENT_HANDLING,
    snapshotBlock,
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
