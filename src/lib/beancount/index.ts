import { parse, BeancountParseError, type ParseResult } from 'beancount'

export interface BeancountDiagnostic {
  startLine: number
  endLine: number
  message: string
  nodeType?: string
  fragment: string[]
}

export interface BeancountValidationResult {
  valid: boolean
  errors: BeancountDiagnostic[]
  counts: Record<string, number>
  accounts: string[]
  tags: string[]
  flags: string[]
  nodes: Array<Record<string, unknown>>
}

const directiveGroups = [
  'transactions',
  'open',
  'close',
  'commodity',
  'balance',
  'pad',
  'note',
  'document',
  'price',
  'event',
  'query',
  'custom',
  'option',
  'plugin',
  'include',
  'pushtag',
  'poptag',
] as const

function summarize(result: ParseResult): Omit<BeancountValidationResult, 'valid' | 'errors'> {
  const counts: Record<string, number> = {}
  for (const key of directiveGroups) {
    const arr = (result as unknown as Record<string, unknown[]>)[key]
    counts[key] = Array.isArray(arr) ? arr.length : 0
  }
  return {
    counts,
    accounts: [...result.accounts].sort(),
    tags: [...result.tags].sort(),
    flags: [...result.flags].sort(),
    nodes: result.nodes.map((n) => n.toJSON()),
  }
}

export function parseBeancount(source: string): BeancountValidationResult {
  try {
    const result = parse(source)
    return { valid: true, errors: [], ...summarize(result) }
  } catch (err) {
    if (err instanceof BeancountParseError) {
      return {
        valid: false,
        errors: [
          {
            startLine: err.location.startLine,
            endLine: err.location.endLine,
            message: err.message,
            nodeType: err.nodeType,
            fragment: err.sourceContent,
          },
        ],
        counts: {},
        accounts: [],
        tags: [],
        flags: [],
        nodes: [],
      }
    }
    throw err
  }
}
