// System-prompt fragments for the AI agent. The .md files alongside this
// module are the source of truth — they're inlined as strings at build time
// via the webpack `asset/source` rule in next.config.mjs.

import BEANCOUNT_PRIMER from './beancount-primer.md'
import TOOL_RULES from './tool-rules.md'
import EXAMPLES from './examples.md'

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

  return [BEANCOUNT_PRIMER, TOOL_RULES, EXAMPLES, snapshotBlock].join('\n\n---\n\n')
}
