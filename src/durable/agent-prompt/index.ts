// System-prompt fragments for the AI agent. The .md files alongside this
// module are the source of truth — they're codegen'd into inline.generated.ts
// by scripts/build-agent-prompt.mjs, which runs automatically before build
// and deploy. Edit the .md files, not the generated one.

import {
  BEANCOUNT_PRIMER,
  TOOL_RULES,
  EXAMPLES,
  STATEMENT_HANDLING,
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

  return [
    BEANCOUNT_PRIMER,
    TOOL_RULES,
    EXAMPLES,
    STATEMENT_HANDLING,
    snapshotBlock,
  ].join('\n\n---\n\n')
}
