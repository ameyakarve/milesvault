'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'

type CardHit = { slug: string; name: string }
type PickedCard = { slug: string; name: string; account: string }
type Programme = { slug: string; name: string; account: string; ticker: string }

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function CheckRow({
  on,
  loading,
  label,
  onClick,
}: {
  on: boolean
  loading?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60"
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded border',
          on ? 'border-foreground bg-foreground text-background' : 'border-border',
        )}
      >
        {loading ? (
          <Spinner className="size-3" />
        ) : on ? (
          <Check className="size-3" strokeWidth={3} />
        ) : null}
      </span>
      <span className="text-foreground">{label}</span>
    </button>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs text-foreground">
      <span className="max-w-44 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

// Add cards AND loyalty programmes: each tab is a search box over the whole KG
// (no issuer gate) and your picks show as removable chips, visible across both
// tabs. Cards resolve their canonical liability account from the KG on pick
// (never a client-side guess); programmes carry their account + ticker. Opens
// `open` directives only — balances come from statements or Update balance.
export function AddAccountsModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone?: () => void
}) {
  const [tab, setTab] = useState<'cards' | 'programmes'>('cards')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  // Cards — typeahead over the KG, account resolved on pick.
  const [cardQuery, setCardQuery] = useState('')
  const [cardHits, setCardHits] = useState<CardHit[]>([])
  const [cardSearching, setCardSearching] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [pickedCards, setPickedCards] = useState<Map<string, PickedCard>>(new Map())

  // Programmes — full closed set, filtered client-side.
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [progLoading, setProgLoading] = useState(false)
  const [progQuery, setProgQuery] = useState('')
  const [pickedProg, setPickedProg] = useState<Map<string, Programme>>(new Map())

  // Debounced card search (the KG typeahead needs ≥2 chars).
  useEffect(() => {
    const q = cardQuery.trim()
    if (q.length < 2) {
      setCardHits([])
      setCardSearching(false)
      return
    }
    setCardSearching(true)
    const ac = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/kb/cards/search?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ items: CardHit[] }>) : null))
        .then((d) => setCardHits(d?.items ?? []))
        .catch(() => {})
        .finally(() => setCardSearching(false))
    }, 250)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [cardQuery])

  // Load programmes once when the tab is first opened.
  useEffect(() => {
    if (!open || tab !== 'programmes' || programmes.length) return
    setProgLoading(true)
    fetch('/api/kb/programmes')
      .then((r) => (r.ok ? (r.json() as Promise<{ items: Programme[] }>) : null))
      .then((d) => d && setProgrammes(d.items))
      .catch(() => {})
      .finally(() => setProgLoading(false))
  }, [open, tab, programmes.length])

  const filteredProg = useMemo(() => {
    const q = progQuery.trim().toLowerCase()
    return q ? programmes.filter((p) => p.name.toLowerCase().includes(q)) : programmes
  }, [programmes, progQuery])

  async function toggleCard(c: CardHit) {
    if (pickedCards.has(c.slug)) {
      setPickedCards((prev) => {
        const next = new Map(prev)
        next.delete(c.slug)
        return next
      })
      return
    }
    setError(null)
    setResolving(c.slug)
    try {
      const account = await fetch(`/api/kb/cards/account?slug=${encodeURIComponent(c.slug)}`)
        .then(async (res): Promise<string | null> => {
          if (!res.ok) return null
          const d = (await res.json()) as { account: string | null }
          return d.account
        })
        .catch((): null => null)
      if (!account) {
        setError(`Couldn't resolve an account for ${c.name}. Skip it or add via a statement.`)
        return
      }
      setPickedCards((prev) => new Map(prev).set(c.slug, { slug: c.slug, name: c.name, account }))
    } finally {
      setResolving(null)
    }
  }

  function toggleProg(p: Programme) {
    setPickedProg((prev) => {
      const next = new Map(prev)
      if (next.has(p.slug)) next.delete(p.slug)
      else next.set(p.slug, p)
      return next
    })
  }

  const total = pickedCards.size + pickedProg.size

  function reset() {
    setTab('cards')
    setCardQuery('')
    setCardHits([])
    setResolving(null)
    setPickedCards(new Map())
    setProgQuery('')
    setPickedProg(new Map())
    setError(null)
    setDone(null)
  }
  function close() {
    const created = done != null
    reset()
    onClose()
    if (created) onDone?.()
  }

  async function submit() {
    if (total === 0) return
    setBusy(true)
    setError(null)
    try {
      const date = ymd(new Date())
      const lines = [
        ...[...pickedCards.values()].map((c) => `${date} open ${c.account} INR`),
        ...[...pickedProg.values()].map((p) => `${date} open ${p.account} ${p.ticker}`),
      ]
      const resp = await ledgerClient.replaceBuffer([], lines.join('\n') + '\n')
      if (isReplaceBufferError(resp)) {
        setError('message' in resp ? resp.message : 'Save failed')
        return
      }
      setDone(total)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add accounts</DialogTitle>
        </DialogHeader>

        {done != null ? (
          <div className="space-y-2 py-2 text-center">
            <p className="text-sm font-medium text-foreground">
              {done} account{done === 1 ? '' : 's'} added
            </p>
            <p className="text-xs text-muted-foreground">
              They&apos;re on the Vault. Balances come from statements or Update balance.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div role="tablist" aria-label="Account type" className="inline-flex rounded-md border border-border p-0.5 text-xs">
              {(['cards', 'programmes'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'rounded px-3 py-1 capitalize',
                    tab === t
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'cards' ? (
              <>
                <Input
                  placeholder="Search cards (Axis Magnus, HDFC Infinia…)"
                  value={cardQuery}
                  onChange={(e) => setCardQuery(e.target.value)}
                  autoFocus
                />
                <ScrollArea className="h-48 rounded-md border border-border">
                  {cardQuery.trim().length < 2 ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Type to search cards across all issuers.
                    </p>
                  ) : cardSearching ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">Searching…</p>
                  ) : cardHits.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">No matching card.</p>
                  ) : (
                    <ul className="p-1">
                      {cardHits.map((c) => (
                        <li key={c.slug}>
                          <CheckRow
                            on={pickedCards.has(c.slug)}
                            loading={resolving === c.slug}
                            label={c.name}
                            onClick={() => void toggleCard(c)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </>
            ) : (
              <>
                <Input
                  placeholder="Search programmes (KrisFlyer, Marriott…)"
                  value={progQuery}
                  onChange={(e) => setProgQuery(e.target.value)}
                  autoFocus
                />
                <ScrollArea className="h-48 rounded-md border border-border">
                  {progLoading ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</p>
                  ) : (
                    <ul className="p-1">
                      {filteredProg.map((p) => (
                        <li key={p.slug}>
                          <CheckRow
                            on={pickedProg.has(p.slug)}
                            label={p.name}
                            onClick={() => toggleProg(p)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </>
            )}

            {total > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{total} selected</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...pickedCards.values()].map((c) => (
                    <Chip
                      key={c.slug}
                      label={c.name}
                      onRemove={() =>
                        setPickedCards((prev) => {
                          const next = new Map(prev)
                          next.delete(c.slug)
                          return next
                        })
                      }
                    />
                  ))}
                  {[...pickedProg.values()].map((p) => (
                    <Chip
                      key={p.slug}
                      label={p.name}
                      onRemove={() =>
                        setPickedProg((prev) => {
                          const next = new Map(prev)
                          next.delete(p.slug)
                          return next
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        )}

        <DialogFooter>
          {done != null ? (
            <Button size="sm" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void submit()} disabled={total === 0 || busy}>
                {busy ? <Spinner className="size-4" /> : `Add ${total || ''}`.trim()}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
