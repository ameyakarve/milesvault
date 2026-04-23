import { visualTextLen } from './entities'
import { splitEntries } from './extract'

export function format(text: string): string {
  const lines = text.split('\n')
  const entryEnd = new Map<number, number>()
  for (const e of splitEntries(text)) entryEnd.set(e.startLine, e.endLine)

  const out: string[] = new Array(lines.length)
  for (let i = 0; i < lines.length; i++) {
    const end = entryEnd.get(i)
    if (end === undefined) {
      out[i] = lines[i]
      continue
    }
    out[i] = lines[i]
    for (let j = i + 1; j <= end; j++) out[j] = formatPostingLine(lines[j])
    i = end
  }
  return out.join('\n')
}

function space(length: number) {
  return ' '.repeat(length)
}

function stripTrailingZeros(s: string): string {
  return s.replace(/(\d)\.00(?!\d)/g, '$1')
}

// https://ledger-cli.org/doc/ledger3.html#Journal-Format
function formatPostingLine(line: string) {
  const amountAlignmentColumn = 60
  const fullMatch = line.match(
    /^[ \t]+(?<account>(?:[*!]\s+)?[^; \t\n](?:(?!\s{2})[^;\t\n])+)[ \t]+(?<prefix>[^;]*?)(?<amount>[+-]?[.,0-9]+)(?<suffix>.*)$/,
  )
  if (fullMatch) {
    const { account, prefix, suffix } = fullMatch.groups!
    const amount = stripTrailingZeros(fullMatch.groups!.amount)
    const cleanedSuffix = stripTrailingZeros(suffix)
    const acctVis = visualTextLen(account)
    const preVis = visualTextLen(prefix)
    const amtVis = visualTextLen(amount)
    if (acctVis + preVis + amtVis <= amountAlignmentColumn - 4) {
      return (
        space(2) +
        account +
        space(amountAlignmentColumn - 2 - acctVis - preVis - amtVis) +
        prefix +
        amount +
        cleanedSuffix
      )
    }
  }
  return line
}
