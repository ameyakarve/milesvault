'use client'

import { useEffect, useState } from 'react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'

type Issuer = { slug: string; name: string }
type Card = { slug: string; name: string }
type Picked = Card & { issuerSlug: string; issuerName: string }

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// PascalCase issuer prefix from its slug ("idfc-first" → "IdfcFirst").
function issuerSegment(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join('')
}

// Card leaf from the card name, dropping the issuer + filler words.
function cardLeaf(name: string, issuerName: string): string {
  const drop = new Set(['bank', 'credit', 'card', ...issuerName.toLowerCase().split(/\s+/)])
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter((t) => t && !drop.has(t.toLowerCase()))
    .map((t) => t[0]!.toUpperCase() + t.slice(1))
    .join('')
}

// Add cards — pick an issuer, tick the cards you hold (across issuers; the
// selection accumulates), add them all at once. Each becomes an open
// directive (the save path auto-opens its rewards wallet). No balances:
// points and dues come from statements, never a guess typed here.
export function AddCardModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone?: () => void
}) {
  const [issuers, setIssuers] = useState<Issuer[]>([])
  const [issuer, setIssuer] = useState<Issuer | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [cardsLoading, setCardsLoading] = useState(false)
  const [picked, setPicked] = useState<Map<string, Picked>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

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

  function toggle(c: Card) {
    if (!issuer) return
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(c.slug)) next.delete(c.slug)
      else next.set(c.slug, { ...c, issuerSlug: issuer.slug, issuerName: issuer.name })
      return next
    })
  }

  function reset() {
    setIssuer(null)
    setCards([])
    setPicked(new Map())
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
    if (picked.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const date = ymd(new Date())
      const text =
        [...picked.values()]
          .map(
            (p) =>
              `${date} open Liabilities:CreditCards:${issuerSegment(p.issuerSlug)}:${cardLeaf(p.name, p.issuerName)} INR`,
          )
          .join('\n') + '\n'
      const resp = await ledgerClient.replaceBuffer([], text)
      if (isReplaceBufferError(resp)) {
        setError('message' in resp ? resp.message : 'Save failed')
        return
      }
      setDone(picked.size)
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
          <DialogTitle>Add cards</DialogTitle>
        </DialogHeader>

        {done != null ? (
          <div className="space-y-2 py-2 text-center">
            <p className="text-sm font-medium text-foreground">
              {done} card{done === 1 ? '' : 's'} added
            </p>
            <p className="text-xs text-muted-foreground">
              Their rewards programmes are on the Vault. Statements fill in balances and points.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-1">
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

            <ScrollArea className="h-56 rounded-md border border-border">
              {!issuer ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  Pick an issuer to see its cards.
                </p>
              ) : cardsLoading ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</p>
              ) : (
                <ul className="p-1">
                  {cards.map((c) => {
                    const on = picked.has(c.slug)
                    return (
                      <li key={c.slug}>
                        <button
                          type="button"
                          onClick={() => toggle(c)}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded border ${on ? 'border-foreground bg-foreground text-background' : 'border-border'}`}
                          >
                            {on ? <Check className="size-3" strokeWidth={3} /> : null}
                          </span>
                          <span className="text-foreground">{c.name}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </ScrollArea>

            {picked.size > 0 ? (
              <p className="text-xs text-muted-foreground">
                {picked.size} selected:{' '}
                <span className="text-foreground">
                  {[...picked.values()].map((p) => p.name).join(', ')}
                </span>
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
              <Button size="sm" onClick={() => void submit()} disabled={picked.size === 0 || busy}>
                {busy ? (
                  <Spinner className="size-4" />
                ) : (
                  `Add ${picked.size || ''} card${picked.size === 1 ? '' : 's'}`.trim()
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
