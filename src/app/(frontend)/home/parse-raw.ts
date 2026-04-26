export type ParsedHeader = {
  date: string
  flag: string
  payee: string | null
  narration: string | null
}

export type ParsedPosting = {
  account: string
  amount: number | null
  currency: string | null
}

export type ParsedTxn = {
  header: ParsedHeader
  postings: ParsedPosting[]
}

const HEADER_RE =
  /^(\d{4}-\d{2}-\d{2})\s+([*!])\s*(?:"([^"]*)"\s+"([^"]*)"|"([^"]*)")?/

const POSTING_RE =
  /^[ \t]+([A-Z][A-Za-z0-9-]*(?::[A-Z0-9][A-Za-z0-9-]*)+)(?:\s+(-?[\d,]+(?:\.\d+)?)\s+([A-Z][A-Z0-9]*))?/

export function parseTxn(rawText: string): ParsedTxn | null {
  const lines = rawText.split('\n')
  let header: ParsedHeader | null = null
  const postings: ParsedPosting[] = []
  for (const line of lines) {
    if (!header) {
      const m = HEADER_RE.exec(line)
      if (m) {
        const payee = m[3] ?? null
        const narration = payee != null ? (m[4] ?? null) : (m[5] ?? null)
        header = { date: m[1], flag: m[2], payee, narration }
      }
      continue
    }
    const pm = POSTING_RE.exec(line)
    if (!pm) continue
    const amount = pm[2] != null ? parseFloat(pm[2].replace(/,/g, '')) : null
    postings.push({
      account: pm[1],
      amount: amount != null && Number.isFinite(amount) ? amount : null,
      currency: pm[3] ?? null,
    })
  }
  return header ? { header, postings } : null
}

export function postingForAccount(txn: ParsedTxn, account: string): ParsedPosting | null {
  return txn.postings.find((p) => p.account === account) ?? null
}
