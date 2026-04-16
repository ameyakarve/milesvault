export type TxnStubOptions = {
  date: string
  currency?: string
}

const TXN_HEADER_RE = /^\d{4}-\d{2}-\d{2}[ \t]+(?:\*|!|txn\b|[A-Z]\b)/

function buildStub(opts: TxnStubOptions): string {
  const currency = opts.currency ?? 'INR'
  return `${opts.date} * "" ""\n  Expenses:Todo     0 ${currency}\n  Assets:Todo      -0 ${currency}\n`
}

function findTxnRanges(text: string): Array<{ start: number; end: number }> {
  const starts: number[] = []
  const lines = text.split('\n')
  let offset = 0
  for (const line of lines) {
    if (TXN_HEADER_RE.test(line)) starts.push(offset)
    offset += line.length + 1
  }
  return starts.map((start, i) => ({
    start,
    end: i + 1 < starts.length ? starts[i + 1] : text.length,
  }))
}

function normalizeJoin(prefix: string, body: string): string {
  if (prefix && !prefix.endsWith('\n')) prefix += '\n'
  if (prefix && !prefix.endsWith('\n\n')) prefix += '\n'
  return prefix + body
}

export function appendTxnStub(text: string, opts: TxnStubOptions): string {
  const stub = buildStub(opts)
  if (!text.trim()) return stub
  return normalizeJoin(text.replace(/\s*$/, ''), stub)
}

export function insertTxnAt(text: string, index: number, opts: TxnStubOptions): string {
  const ranges = findTxnRanges(text)
  const stub = buildStub(opts)
  if (index >= ranges.length) return appendTxnStub(text, opts)
  const target = ranges[Math.max(0, index)]
  const before = text.slice(0, target.start).replace(/\s*$/, '')
  const after = text.slice(target.start)
  return normalizeJoin(before, stub + '\n' + after)
}

export function removeTxnAt(text: string, index: number): string {
  const ranges = findTxnRanges(text)
  if (index < 0 || index >= ranges.length) return text
  const { start, end } = ranges[index]
  const before = text.slice(0, start).replace(/\s*$/, '')
  const after = text.slice(end).replace(/^\s*/, '')
  if (!before) return after
  if (!after) return before + '\n'
  return before + '\n\n' + after
}
