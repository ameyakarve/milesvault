import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'

let accountsCache: Promise<string[]> | null = null
let linksCache: Promise<string[]> | null = null
let commoditiesCache: Promise<string[]> | null = null

async function loadAccounts(): Promise<string[]> {
  if (!accountsCache) {
    accountsCache = (async () => {
      try {
        const res = await fetch('/api/accounts?limit=500&depth=0', { credentials: 'include' })
        const data = (await res.json()) as { docs: Array<{ path: string }> }
        return data.docs.map((a) => a.path).sort()
      } catch {
        return []
      }
    })()
  }
  return accountsCache
}

async function loadLinks(): Promise<string[]> {
  if (!linksCache) {
    linksCache = (async () => {
      try {
        const res = await fetch('/api/txns?limit=200&depth=0&sort=-date', {
          credentials: 'include',
        })
        const data = (await res.json()) as {
          docs: Array<{ links?: string[] | null }>
        }
        const set = new Set<string>()
        for (const doc of data.docs) {
          for (const link of doc.links ?? []) set.add(link)
        }
        return [...set].sort()
      } catch {
        return []
      }
    })()
  }
  return linksCache
}

async function loadCommodities(): Promise<string[]> {
  if (!commoditiesCache) {
    commoditiesCache = (async () => {
      try {
        const res = await fetch('/api/commodities?limit=500&depth=0', {
          credentials: 'include',
        })
        const data = (await res.json()) as { docs: Array<{ code: string }> }
        return data.docs.map((c) => c.code).sort()
      } catch {
        return []
      }
    })()
  }
  return commoditiesCache
}

export function resetAutocompleteCache(): void {
  accountsCache = null
  linksCache = null
  commoditiesCache = null
}

async function accountSource(context: CompletionContext): Promise<CompletionResult | null> {
  const line = context.state.doc.lineAt(context.pos)
  if (!/^\s/.test(line.text)) return null

  const before = line.text.slice(0, context.pos - line.from)
  if (!/^\s+[A-Za-z:\-_0-9]*$/.test(before)) return null

  const word = context.matchBefore(/[A-Za-z][A-Za-z0-9:\-_]*/)
  const from = word ? word.from : context.pos
  if (word && word.from === word.to && !context.explicit) return null

  const accounts = await loadAccounts()
  if (accounts.length === 0) return null

  return {
    from,
    options: accounts.map((label) => ({ label, type: 'class' })),
    validFor: /^[A-Za-z0-9:\-_]*$/,
  }
}

async function commoditySource(context: CompletionContext): Promise<CompletionResult | null> {
  const line = context.state.doc.lineAt(context.pos)
  if (!/^\s/.test(line.text)) return null

  const before = line.text.slice(0, context.pos - line.from)
  if (!/\s-?[\d.,]+\s+[A-Z]*$/.test(before)) return null

  const word = context.matchBefore(/[A-Z][A-Z0-9'._\-]*/)
  const from = word ? word.from : context.pos
  if (word && word.from === word.to && !context.explicit) return null

  const commodities = await loadCommodities()
  if (commodities.length === 0) return null

  return {
    from,
    options: commodities.map((label) => ({ label, type: 'type' })),
    validFor: /^[A-Z0-9'._\-]*$/,
  }
}

async function linkSource(context: CompletionContext): Promise<CompletionResult | null> {
  const word = context.matchBefore(/\^[A-Za-z0-9\-_./]*/)
  if (!word) return null
  if (word.from === word.to - 1 && !context.explicit) return null

  const links = await loadLinks()
  if (links.length === 0) return null

  return {
    from: word.from + 1,
    options: links.map((label) => ({ label, type: 'keyword' })),
    validFor: /^[A-Za-z0-9\-_./]*$/,
  }
}

export const beancountAutocomplete = autocompletion({
  override: [accountSource, commoditySource, linkSource],
  activateOnTyping: true,
  closeOnBlur: true,
})
