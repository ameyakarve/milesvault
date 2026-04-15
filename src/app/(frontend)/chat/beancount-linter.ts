import { linter, type Diagnostic } from '@codemirror/lint'
import { parse, BeancountParseError } from 'beancount'

export const beancountLinter = linter((view) => {
  const doc = view.state.doc
  const text = doc.toString()
  if (!text.trim()) return []

  let result
  try {
    result = parse(text)
  } catch (err) {
    return [toDiagnostic(doc, err)]
  }

  const docRange = { from: 0, to: doc.line(doc.lines).to }

  if (result.transactions.length === 0) {
    return [
      {
        ...docRange,
        severity: 'error',
        message:
          'No transaction recognized. Check the date (YYYY-MM-DD), flag (* or !), and posting indentation.',
      },
    ]
  }

  const missingLink = result.transactions.some((t) => t.links.size === 0)
  if (missingLink) {
    return [
      {
        ...docRange,
        severity: 'error',
        message: 'Transaction must have at least one link (e.g. ^receipt-1234).',
      },
    ]
  }

  return []
})

function toDiagnostic(
  doc: { lines: number; line: (n: number) => { from: number; to: number } },
  err: unknown,
): Diagnostic {
  if (err instanceof BeancountParseError) {
    const totalLines = doc.lines
    const startLineNo = clamp(err.location.startLine, 1, totalLines)
    const endLineNo = clamp(err.location.endLine, startLineNo, totalLines)
    const start = doc.line(startLineNo)
    const end = doc.line(endLineNo)
    return {
      from: start.from,
      to: end.to,
      severity: 'error',
      message: err.message,
    }
  }
  return {
    from: 0,
    to: doc.line(doc.lines).to,
    severity: 'error',
    message: err instanceof Error ? err.message : String(err),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
