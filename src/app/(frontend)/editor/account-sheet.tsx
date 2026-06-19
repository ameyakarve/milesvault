'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, X, Search } from 'lucide-react'
import { parseJournal } from '@/lib/beancount/ast'

type TreeNode = {
  name: string
  full: string
  children: TreeNode[]
}

function collectAccounts(text: string): string[] {
  let accounts: Set<string>
  try {
    const parsed = parseJournal(text)
    accounts = new Set<string>()
    for (const d of parsed.directives) {
      if ('account' in d && typeof d.account === 'string') accounts.add(d.account)
    }
    for (const t of parsed.transactions) {
      for (const p of t.postings) accounts.add(p.account)
    }
  } catch {
    accounts = new Set<string>()
    const RE = /\b(Assets|Liabilities|Equity|Income|Expenses)(?::[A-Za-z0-9\-_]+)+/g
    let m: RegExpExecArray | null
    while ((m = RE.exec(text)) !== null) accounts.add(m[0])
  }
  return [...accounts].sort()
}

function buildTree(accounts: string[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const account of accounts) {
    const parts = account.split(':')
    let level = root
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      acc = acc ? `${acc}:${part}` : part
      let node = level.find((n) => n.name === part)
      if (!node) {
        node = { name: part, full: acc, children: [] }
        level.push(node)
      }
      level = node.children
    }
  }
  return root
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes
  const q = query.toLowerCase()
  const out: TreeNode[] = []
  for (const n of nodes) {
    const selfMatch = n.full.toLowerCase().includes(q)
    const childMatches = filterTree(n.children, query)
    if (selfMatch || childMatches.length > 0) {
      out.push({ ...n, children: selfMatch ? n.children : childMatches })
    }
  }
  return out
}

export function AccountSheet({
  text,
  onSelect,
  onClose,
}: {
  text: string
  onSelect: (account: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tree = useMemo(() => buildTree(collectAccounts(text)), [text])
  const filtered = useMemo(() => filterTree(tree, query.trim()), [tree, query])

  return (
    <div
      className="fixed inset-0 z-40 flex bg-black/40"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-sm flex-col bg-background shadow-xl sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="flex-1 text-[14px] font-semibold text-foreground">
            Accounts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="border-b border-border px-4 py-2.5">
          <label className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
            <Search className="size-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts"
              className="flex-1 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              No accounts found.
            </p>
          ) : (
            <ul>
              {filtered.map((n) => (
                <Row
                  key={n.full}
                  node={n}
                  depth={0}
                  onSelect={onSelect}
                  query={query.trim()}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}

function Row({
  node,
  depth,
  onSelect,
  query,
}: {
  node: TreeNode
  depth: number
  onSelect: (account: string) => void
  query: string
}) {
  // Derived default (top level open; searching opens everything) with a manual
  // override keyed to the query — when the query changes the override no longer
  // matches and `open` falls back to the default. No setState during render
  // (which React may drop or double-run in prod builds). Mirrors the JournalAccount
  // picker pattern in journal-filter-bar.tsx.
  const [manual, setManual] = useState<{ query: string; open: boolean } | null>(null)
  const open = manual && manual.query === query ? manual.open : depth < 1 || query.length > 0
  const setOpen = (fn: (v: boolean) => boolean) => setManual({ query, open: fn(open) })
  const hasChildren = node.children.length > 0
  return (
    <li>
      <div
        className="flex items-center gap-1 hover:bg-muted/50"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <ChevronRight
              className={`size-3.5 transition ${open ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="size-[18px]" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.full)}
          className="flex-1 truncate py-1.5 pr-3 text-left text-[13px] text-foreground/80 hover:text-foreground"
          title={node.full}
        >
          {node.name}
        </button>
      </div>
      {hasChildren && open ? (
        <ul>
          {node.children.map((c) => (
            <Row
              key={c.full}
              node={c}
              depth={depth + 1}
              onSelect={onSelect}
              query={query}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
