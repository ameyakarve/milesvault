import { linter, type Diagnostic } from '@codemirror/lint'

import { validateBeancount } from '@/lib/beancount/validate'

export const beancountLinter = linter((view) => {
  const doc = view.state.doc
  const text = doc.toString()
  if (!text.trim()) return []

  const diagnostics = validateBeancount(text)
  if (diagnostics.length === 0) return []

  const totalLines = doc.lines
  const docRange = { from: 0, to: doc.line(totalLines).to }

  return diagnostics.map<Diagnostic>((d) => {
    if (d.line) {
      const startLineNo = clamp(d.line.startLine, 1, totalLines)
      const endLineNo = clamp(d.line.endLine, startLineNo, totalLines)
      const start = doc.line(startLineNo)
      const end = doc.line(endLineNo)
      return { from: start.from, to: end.to, severity: d.severity, message: d.message }
    }
    return { ...docRange, severity: d.severity, message: d.message }
  })
})

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
