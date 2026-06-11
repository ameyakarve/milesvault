'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'

type Issuer = { slug: string; name: string }
type Card = { slug: string; name: string }
type Programme = { slug: string; name: string; account: string; ticker: string }

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function issuerSegment(slug: string): string {
  return slug.split('-').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join('')
}
function cardLeaf(name: string, issuerName: string): string {
  const drop = new Set(['bank', 'credit', 'card', ...issuerName.toLowerCase().split(/\s+/)])
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter((t) => t && !drop.has(t.toLowerCase()))
    .map((t) => t[0]!.toUpperCase() + t.slice(1))
    .join('')
}

function CheckRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded border',
          on ? 'border-foreground bg-foreground text-background' : 'border-border',
        )}
      >
        {on ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="text-foreground">{label}</span>
    </button>
  )
}

// Add cards AND programmes: a tabbed multi-select. Cards → issuer then tick
// (open directives, auto-opening their reward wallets). Programmes → tick
// loyalty currencies (open directives in the right Miles/Points account with
// the commodity). No balances — those come from statements or Update balance.
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

  // Cards
  const [issuers, setIssuers] = useState<Issuer[]>([])
  const [issuer, setIssuer] = useState<Issuer | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [cardsLoading, setCardsLoading] = useState(false)
  const [pickedCards, setPickedCards] = useState<
    Map<string, Card & { issuerSlug: string; issuerName: string }>
  >(new Map())

  // Programmes
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [progLoading, setProgLoading] = useState(false)
  const [progQuery, setProgQuery] = useState('')
  const [pickedProg, setPickedProg] = useState<Map<string, Programme>>(new Map())

  useEffect(() => {
    if (!open || issuers.length) return
    fetch('/api/kb/issuers')
      .then((r) => (r.ok ? (r.json() as Promise<{ items: Issuer[] }>) : null))
      .then((d) => d && setIssuers(d.items))
      .catch(() => {})
  }, [open, issuers.length])

  useEffect(() => {
    if (!issuer) return
    setCards([])
    setCardsLoading(true)
    fetch(`/api/kb/cards/by-issuer?issuer=${encodeURIComponent(issuer.slug)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ items: Card[] }>) : null))
      .then((d) => d && setCards(d.items))
      .catch(() => {})
      .finally(() => setCardsLoading(false))
  }, [issuer])

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

  const total = pickedCards.size + pickedProg.size

  function reset() {
    setTab('cards')
    setIssuer(null)
    setCards([])
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
        ...[...pickedCards.values()].map(
          (p) =>
            `${date} open Liabilities:CreditCards:${issuerSegment(p.issuerSlug)}:${cardLeaf(p.name, p.issuerName)} INR`,
        ),
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
            <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
              {(['cards', 'programmes'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'rounded px-3 py-1 capitalize',
                    tab === t ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'cards' ? (
              <>
                <Select
                  value={issuer?.slug ?? ''}
                  onValueChange={(slug) => setIssuer(issuers.find((i) => i.slug === slug) ?? null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an issuer" />
                  </SelectTrigger>
                  <SelectContent>
                    {issuers.map((i) => (
                      <SelectItem key={i.slug} value={i.slug}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ScrollArea className="h-52 rounded-md border border-border">
                  {!issuer ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Pick an issuer to see its cards.
                    </p>
                  ) : cardsLoading ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</p>
                  ) : (
                    <ul className="p-1">
                      {cards.map((c) => (
                        <li key={c.slug}>
                          <CheckRow
                            on={pickedCards.has(c.slug)}
                            label={c.name}
                            onClick={() =>
                              setPickedCards((prev) => {
                                const next = new Map(prev)
                                if (next.has(c.slug)) next.delete(c.slug)
                                else next.set(c.slug, { ...c, issuerSlug: issuer.slug, issuerName: issuer.name })
                                return next
                              })
                            }
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
                />
                <ScrollArea className="h-52 rounded-md border border-border">
                  {progLoading ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</p>
                  ) : (
                    <ul className="p-1">
                      {filteredProg.map((p) => (
                        <li key={p.slug}>
                          <CheckRow
                            on={pickedProg.has(p.slug)}
                            label={p.name}
                            onClick={() =>
                              setPickedProg((prev) => {
                                const next = new Map(prev)
                                if (next.has(p.slug)) next.delete(p.slug)
                                else next.set(p.slug, p)
                                return next
                              })
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </>
            )}

            {total > 0 ? (
              <p className="text-xs text-muted-foreground">
                {total} selected
                {pickedCards.size && pickedProg.size
                  ? ` (${pickedCards.size} card${pickedCards.size === 1 ? '' : 's'}, ${pickedProg.size} programme${pickedProg.size === 1 ? '' : 's'})`
                  : ''}
              </p>
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
