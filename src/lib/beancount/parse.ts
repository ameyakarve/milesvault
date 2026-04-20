import { parser } from 'lezer-beancount'

type Tree = ReturnType<typeof parser.parse>
type SyntaxNode = Tree['topNode']

export type Range = { from: number; to: number }

export type ParsedAmount = {
  range: Range
  numberText: string
  currency: string | null
}

export type ParsedPosting = {
  range: Range
  flag: string | null
  account: string
  accountRange: Range
  amount: ParsedAmount | null
}

export type ParsedTxn = {
  range: Range
  headerRange: Range
  date: string
  flag: string | null
  payee: string | null
  narration: string | null
  tags: string[]
  links: string[]
  postings: ParsedPosting[]
}

export type ParseDiagnostic = {
  from: number
  to: number
  message: string
}

export type ParseResult = {
  entries: ParsedTxn[]
  diagnostics: ParseDiagnostic[]
}

const ERROR_NODE = '⚠'

export function parseBuffer(doc: string): ParseResult {
  const tree: Tree = parser.parse(doc)
  const diagnostics: ParseDiagnostic[] = []
  const errorRanges: Range[] = []
  const directiveNodes: SyntaxNode[] = []

  tree.iterate({
    enter(node) {
      if (node.name === ERROR_NODE) {
        const from = node.from
        const to = node.to === node.from ? Math.min(doc.length, node.from + 1) : node.to
        diagnostics.push({ from, to, message: 'Syntax error.' })
        errorRanges.push({ from, to })
        return undefined
      }
      if (node.name === 'DatedDirective') {
        directiveNodes.push(node.node)
        return undefined
      }
      return undefined
    },
  })

  const entries: ParsedTxn[] = []
  for (const dn of directiveNodes) {
    if (rangeOverlapsAny({ from: dn.from, to: dn.to }, errorRanges)) continue
    const parsed = readDatedDirective(dn, doc)
    if (parsed) entries.push(parsed)
  }

  return { entries, diagnostics }
}

function rangeOverlapsAny(r: Range, ranges: readonly Range[]): boolean {
  for (const o of ranges) {
    if (o.from < r.to && o.to > r.from) return true
  }
  return false
}

function readDatedDirective(directive: SyntaxNode, doc: string): ParsedTxn | null {
  const dateNode = directive.getChild('Date')
  const txn = directive.getChild('Transaction')
  if (!dateNode || !txn) return null

  const headerEnd = firstPostingBlockStart(txn) ?? txn.to
  const header: Range = { from: directive.from, to: headerEnd }

  const date = doc.slice(dateNode.from, dateNode.to)
  const flag = readChildText(txn, 'TxnFlag', doc) ?? readChildText(txn, 'TxnKeyword', doc)

  const strings = readChildrenText(txn, 'String', doc)
  const payee = strings.length >= 2 ? strings[0] : null
  const narration = strings.length >= 2 ? strings[1] : (strings[0] ?? null)

  const tags = readChildrenText(txn, 'Tag', doc).map(stripLeading)
  const links = readChildrenText(txn, 'Link', doc).map(stripLeading)

  const postings: ParsedPosting[] = []
  const pb = txn.getChild('PostingBlock')
  if (pb) {
    for (let c = pb.firstChild; c; c = c.nextSibling) {
      if (c.name !== 'Posting') continue
      const p = readPosting(c, doc)
      if (p) postings.push(p)
    }
  }

  return {
    range: { from: directive.from, to: directive.to },
    headerRange: header,
    date,
    flag,
    payee,
    narration,
    tags,
    links,
    postings,
  }
}

function readPosting(node: SyntaxNode, doc: string): ParsedPosting | null {
  const accountNode = node.getChild('Account')
  if (!accountNode) return null
  const account = doc.slice(accountNode.from, accountNode.to)
  const accountRange = { from: accountNode.from, to: accountNode.to }

  let flag: string | null = null
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'TxnFlag') {
      flag = doc.slice(c.from, c.to)
      break
    }
    if (c.name === 'Account') break
  }

  const amountNode = node.getChild('Amount')
  const amount = amountNode ? readAmount(amountNode, doc) : null

  return {
    range: { from: node.from, to: node.to },
    flag,
    account,
    accountRange,
    amount,
  }
}

function readAmount(node: SyntaxNode, doc: string): ParsedAmount {
  const currencyNode = node.getChild('Currency')
  const currency = currencyNode ? doc.slice(currencyNode.from, currencyNode.to) : null
  const numberEnd = currencyNode ? currencyNode.from : node.to
  const numberText = doc.slice(node.from, numberEnd).trim()
  return {
    range: { from: node.from, to: node.to },
    numberText,
    currency,
  }
}

function firstPostingBlockStart(node: SyntaxNode): number | null {
  const pb = node.getChild('PostingBlock')
  return pb ? pb.from : null
}

function readChildText(node: SyntaxNode, name: string, doc: string): string | null {
  const c = node.getChild(name)
  return c ? doc.slice(c.from, c.to) : null
}

function readChildrenText(node: SyntaxNode, name: string, doc: string): string[] {
  const out: string[] = []
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name !== name) continue
    out.push(unquote(doc.slice(c.from, c.to)))
  }
  return out
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1)
  return s
}

function stripLeading(s: string): string {
  if (s.startsWith('#') || s.startsWith('^')) return s.slice(1)
  return s
}
