'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronRight, Search, User, X } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type DateRange = { from: string; to: string }

export type JournalFilter = {
  account: string | null
  date: DateRange | null
}

type TreeNode = {
  name: string
  full: string
  children: TreeNode[]
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function startOfMonth(year: number, monthZero: number): string {
  return `${year}-${pad2(monthZero + 1)}-01`
}
function endOfMonth(year: number, monthZero: number): string {
  const last = new Date(year, monthZero + 1, 0).getDate()
  return `${year}-${pad2(monthZero + 1)}-${pad2(last)}`
}

export function thisMonthRange(today: Date = new Date()): DateRange {
  return {
    from: startOfMonth(today.getFullYear(), today.getMonth()),
    to: endOfMonth(today.getFullYear(), today.getMonth()),
  }
}

function lastMonthRange(today: Date): DateRange {
  const y = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
  const m = today.getMonth() === 0 ? 11 : today.getMonth() - 1
  return { from: startOfMonth(y, m), to: endOfMonth(y, m) }
}

function lastNMonthsRange(today: Date, n: number): DateRange {
  const end = endOfMonth(today.getFullYear(), today.getMonth())
  const startDate = new Date(today.getFullYear(), today.getMonth() - (n - 1), 1)
  return { from: ymd(startDate), to: end }
}

function ytdRange(today: Date): DateRange {
  return { from: `${today.getFullYear()}-01-01`, to: ymd(today) }
}

function formatDateLabel(range: DateRange): string {
  const [fy, fm, fd] = range.from.split('-')
  const [ty, tm, td] = range.to.split('-')
  // Whole-month shortcut
  if (fd === '01' && fy === ty && fm === tm) {
    const last = new Date(Number(fy), Number(fm), 0).getDate()
    if (Number(td) === last) {
      const monthName = new Date(Number(fy), Number(fm) - 1, 1).toLocaleString('en', {
        month: 'short',
      })
      return `${monthName} ${fy}`
    }
  }
  return `${range.from} → ${range.to}`
}

function formatAccountLabel(account: string): string {
  const parts = account.split(':')
  if (parts.length <= 2) return account
  return `…:${parts.slice(-2).join(':')}`
}

export function JournalFilterBar({
  accounts,
  filter,
  onChange,
}: {
  accounts: string[]
  filter: JournalFilter
  onChange: (f: JournalFilter) => void
}) {
  const today = useMemo(() => new Date(), [])

  const dateActive = filter.date != null
  const accountActive = filter.account != null
  const anyActive = dateActive || accountActive

  const [dateOpen, setDateOpen] = useState(false)
  const [acctOpen, setAcctOpen] = useState(false)

  return (
    <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 sm:px-6">
      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger className={chipCls(dateActive)}>
          <Calendar className="size-3.5" />
          <span>{filter.date ? formatDateLabel(filter.date) : 'All time'}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <DatePicker
            today={today}
            value={filter.date}
            onPick={(range) => {
              onChange({ ...filter, date: range })
              setDateOpen(false)
            }}
            onClear={() => {
              onChange({ ...filter, date: null })
              setDateOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      <Popover open={acctOpen} onOpenChange={setAcctOpen}>
        <PopoverTrigger className={chipCls(accountActive)}>
          <User className="size-3.5" />
          <span>
            {filter.account ? formatAccountLabel(filter.account) : 'All accounts'}
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 p-0 sm:w-96"
          sideOffset={6}
        >
          <AccountPicker
            accounts={accounts}
            selected={filter.account}
            onPick={(account) => {
              onChange({ ...filter, account })
              setAcctOpen(false)
            }}
            onClear={() => {
              onChange({ ...filter, account: null })
              setAcctOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      {anyActive ? (
        <button
          type="button"
          onClick={() =>
            onChange({ account: null, date: null })
          }
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3" />
          Reset
        </button>
      ) : null}
    </div>
  )
}

function chipCls(active: boolean): string {
  return cn(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition',
    active
      ? 'border-foreground bg-foreground text-background'
      : 'border-border bg-background text-foreground hover:bg-muted',
  )
}

function DatePicker({
  today,
  value,
  onPick,
  onClear,
}: {
  today: Date
  value: DateRange | null
  onPick: (range: DateRange) => void
  onClear: () => void
}) {
  const fallback = thisMonthRange(today)
  const [customFrom, setCustomFrom] = useState(value?.from ?? fallback.from)
  const [customTo, setCustomTo] = useState(value?.to ?? fallback.to)

  const presets: Array<{ label: string; range: DateRange }> = [
    { label: 'This month', range: thisMonthRange(today) },
    { label: 'Last month', range: lastMonthRange(today) },
    { label: 'Last 3 months', range: lastNMonthsRange(today, 3) },
    { label: 'Year to date', range: ytdRange(today) },
  ]

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {presets.map((p) => {
          const isActive =
            value != null && p.range.from === value.from && p.range.to === value.to
          return (
            <li key={p.label}>
              <button
                type="button"
                onClick={() => onPick(p.range)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted',
                  isActive ? 'font-medium text-foreground' : 'text-foreground/80',
                )}
              >
                <span>{p.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDateLabel(p.range)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 border-t border-border pt-2">
        <p className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Custom
        </p>
        <div className="mt-1 flex flex-col gap-1.5 px-2 pb-1">
          <label className="flex items-center gap-2">
            <span className="w-8 text-[11px] text-muted-foreground">From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-[12px]"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-8 text-[11px] text-muted-foreground">To</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-[12px]"
            />
          </label>
        </div>
        <div className="flex justify-between gap-1.5 px-2 pt-1">
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted"
          >
            All time
          </button>
          <button
            type="button"
            disabled={!customFrom || !customTo || customFrom > customTo}
            onClick={() => onPick({ from: customFrom, to: customTo })}
            className="rounded-md bg-foreground px-2.5 py-1 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

function buildTree(accounts: string[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const account of accounts) {
    const parts = account.split(':')
    let level = root
    let acc = ''
    for (const part of parts) {
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

function AccountPicker({
  accounts,
  selected,
  onPick,
  onClear,
}: {
  accounts: string[]
  selected: string | null
  onPick: (account: string) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const tree = useMemo(() => buildTree(accounts), [accounts])
  const filtered = useMemo(() => filterTree(tree, query.trim()), [tree, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="border-b border-border p-2">
        <label className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
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
          <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            No accounts found.
          </p>
        ) : (
          <ul>
            {filtered.map((n) => (
              <AccountRow
                key={n.full}
                node={n}
                depth={0}
                onPick={onPick}
                selected={selected}
                query={query.trim()}
              />
            ))}
          </ul>
        )}
      </div>
      {selected ? (
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onClear}
            className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted"
          >
            Clear account filter
          </button>
        </div>
      ) : null}
    </div>
  )
}

function AccountRow({
  node,
  depth,
  onPick,
  selected,
  query,
}: {
  node: TreeNode
  depth: number
  onPick: (account: string) => void
  selected: string | null
  query: string
}) {
  const [open, setOpen] = useState(depth < 1 || query.length > 0)
  const [lastQuery, setLastQuery] = useState(query)
  if (lastQuery !== query) {
    setLastQuery(query)
    setOpen(depth < 1 || query.length > 0)
  }
  const hasChildren = node.children.length > 0
  const isSelected = selected === node.full
  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-1 hover:bg-muted/50',
          isSelected && 'bg-muted',
        )}
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
              className={cn('size-3.5 transition', open && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="size-[18px]" />
        )}
        <button
          type="button"
          onClick={() => onPick(node.full)}
          className="flex-1 truncate py-1.5 pr-3 text-left text-[13px] text-foreground/80 hover:text-foreground"
          title={node.full}
        >
          {node.name}
        </button>
      </div>
      {hasChildren && open ? (
        <ul>
          {node.children.map((c) => (
            <AccountRow
              key={c.full}
              node={c}
              depth={depth + 1}
              onPick={onPick}
              selected={selected}
              query={query}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
