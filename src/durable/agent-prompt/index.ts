// System-prompt fragments for the AI agent. The .md files alongside this
// module are the source of truth — they're codegen'd into inline.generated.ts
// by scripts/build-agent-prompt.mjs, which runs automatically before build
// and deploy. Edit the .md files, not the generated one.

import {
  BEANCOUNT_PRIMER,
  TOOL_RULES,
  EXAMPLES,
} from './inline.generated'

export { BEANCOUNT_PRIMER }

export function buildSystemPrompt(snapshot: {
  today: number
  accounts: Array<{ account: string; currencies: string[]; close_date: number | null }>
}): string {
  const accountLines = snapshot.accounts
    .filter((a) => a.close_date == null)
    .map((a) => {
      const ccys = a.currencies.length ? ` [${a.currencies.join(',')}]` : ''
      return `- ${a.account}${ccys}`
    })
    .join('\n')

  // today is YYYYMMDD ordinal; render as ISO for the model.
  const t = snapshot.today
  const iso = `${Math.floor(t / 10000)}-${String(Math.floor((t % 10000) / 100)).padStart(2, '0')}-${String(t % 100).padStart(2, '0')}`

  const snapshotBlock = `# Ledger context

- Today: ${iso}
- Open accounts (use these — don't invent new ones unless none fits):
${accountLines || '- (none yet)'}`

  // STATEMENT_HANDLING is intentionally excluded — the main chat LLM no
  // longer sees raw statement bytes. Uploads now flow through a separate
  // reasoning-off extraction subagent (see LedgerDO.run_statement_extraction)
  // that loads STATEMENT_HANDLING directly. Keeping the block out of the
  // main prompt avoids confusing the model with rules about `<statement>`
  // tags it will never encounter.
  return [
    BEANCOUNT_PRIMER,
    TOOL_RULES,
    EXAMPLES,
    snapshotBlock,
  ].join('\n\n---\n\n')
}
