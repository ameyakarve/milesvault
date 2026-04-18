type State = { inTransaction: boolean; lines: string[] }

const DATE = /^\d{4}-\d{2}-\d{2}/
const AMOUNT_ALIGNMENT_COLUMN = 60

const POSTING_LINE =
  /^[ \t]+(?<account>(?:[*!]\s+)?[^; \t\n](?:(?!\s{2})[^;\t\n])+)[ \t]+(?<prefix>[^;]*?)(?<amount>[+-]?[.,0-9]+)(?<suffix>.*)$/

export function format(text: string): string {
  const state: State = { inTransaction: false, lines: [] }
  for (const line of text.split('\n')) {
    state.lines.push(formatLine(line, state))
  }
  return state.lines.join('\n')
}

function space(length: number): string {
  return ' '.repeat(Math.max(0, length))
}

function formatLine(line: string, state: State): string {
  if (DATE.test(line) || /^[~=]/.test(line)) {
    state.inTransaction = true
    return line
  }

  if (line.trim() === '' || /^[^ \t]/.test(line)) {
    state.inTransaction = false
  }

  if (!state.inTransaction) return line

  const m = line.match(POSTING_LINE)
  if (!m?.groups) return line

  const { account, prefix, amount, suffix } = m.groups
  if (account.length + prefix.length + amount.length > AMOUNT_ALIGNMENT_COLUMN - 6) return line

  const padding = AMOUNT_ALIGNMENT_COLUMN - 4 - account.length - prefix.length - amount.length
  return space(4) + account + space(padding) + prefix + amount + suffix
}
