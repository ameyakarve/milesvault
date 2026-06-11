'use client'

import { useEffect, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'

type Issuer = { slug: string; name: string }
type Card = { slug: string; name: string | null }
type Guide = {
  ok: boolean
  pool?: {
    name: string | null
    ticker: string | null
    account: string | null
    rate_notes: string | null
  } | null
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// PascalCase leaf from a card name, dropping the issuer + filler words.
function cardLeaf(name: string, issuerName: string): string {
  const drop = new Set([
    'bank',
    'credit',
    'card',
    ...issuerName.toLowerCase().split(/\s+/),
  ])
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter((t) => t && !drop.has(t.toLowerCase()))
    .map((t) => t[0]!.toUpperCase() + t.slice(1))
    .join('')
}

// Add a card — a plain form, no chat. Issuer → Card (both dropdowns from the
// KG), then last-4 and an optional current points balance. Confirm writes the
// open directive (the save path auto-opens the rewards wallet) plus a points
// assertion when given, append-only through the batch endpoint.
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
  const [card, setCard] = useState<Card | null>(null)
  const [guide, setGuide] = useState<Guide | null>(null)
  const [last4, setLast4] = useState('')
  const [points, setPoints] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // Load issuers once when opened.
  useEffect(() => {
    if (!open || issuers.length) return
    fetch('/api/kb/issuers')
      .then((r) => (r.ok ? (r.json() as Promise<{ items: Issuer[] }>) : null))
      .then((d) => d && setIssuers(d.items))
      .catch(() => {})
  }, [open, issuers.length])

  // Issuer → cards.
  useEffect(() => {
    if (!issuer) return
    setCards([])
    setCard(null)
    setGuide(null)
    setCardsLoading(true)
    fetch(`/api/kb/cards/by-issuer?issuer=${encodeURIComponent(issuer.slug)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ items: Card[] }>) : null))
      .then((d) => d && setCards(d.items))
      .catch(() => {})
      .finally(() => setCardsLoading(false))
  }, [issuer])

  // Card → guide (reward pool / ticker / rate).
  useEffect(() => {
    if (!card?.name) return
    setGuide(null)
    fetch(`/api/kb/card-guide?name=${encodeURIComponent(card.name)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Guide>) : null))
      .then((g) => setGuide(g))
      .catch(() => {})
  }, [card])

  const wallet = guide?.pool?.account ?? null
  const ticker = guide?.pool?.ticker ?? null
  const liability =
    issuer && card?.name
      ? `Liabilities:CreditCards:${wallet?.split(':').pop() ?? issuer.slug.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}:${cardLeaf(card.name, issuer.name)}${/^\d{4}$/.test(last4) ? `:${last4}` : ''}`
      : null

  function reset() {
    setIssuer(null)
    setCards([])
    setCard(null)
    setGuide(null)
    setLast4('')
    setPoints('')
    setError(null)
    setDone(null)
  }

  function close() {
    const created = !!done
    reset()
    onClose()
    if (created) onDone?.()
  }

  async function submit() {
    if (!liability || !card?.name) return
    setBusy(true)
    setError(null)
    try {
      const today = new Date()
      let text = `${ymd(today)} open ${liability} INR\n`
      const pts = Number(points)
      if (pts > 0 && wallet && ticker) {
        const tomorrow = new Date(today.getTime() + 86400000)
        text += `\n${ymd(today)} pad ${wallet} Equity:Adjustments\n${ymd(tomorrow)} balance ${wallet}  ${Math.round(pts)} ${ticker}\n`
      }
      const resp = await ledgerClient.replaceBuffer([], text)
      if (isReplaceBufferError(resp)) {
        setError('message' in resp ? resp.message : 'Save failed')
        return
      }
      setDone(card.name)
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
          <DialogTitle>Add a card</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="space-y-2 py-2 text-center">
            <p className="text-sm font-medium text-foreground">{done} added</p>
            <p className="text-xs text-muted-foreground">
              The card account is open and its rewards programme is on the Vault.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Issuer</Label>
              <Select
                value={issuer?.slug ?? ''}
                onValueChange={(slug) =>
                  setIssuer(issuers.find((i) => i.slug === slug) ?? null)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a bank" />
                </SelectTrigger>
                <SelectContent>
                  {issuers.map((i) => (
                    <SelectItem key={i.slug} value={i.slug}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Card</Label>
              <Select
                value={card?.slug ?? ''}
                onValueChange={(slug) =>
                  setCard(cards.find((c) => c.slug === slug) ?? null)
                }
                disabled={!issuer || cardsLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !issuer
                        ? 'Pick an issuer first'
                        : cardsLoading
                          ? 'Loading…'
                          : 'Choose a card'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {cards.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.name ?? c.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {card && guide?.ok && guide.pool ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Earns into{' '}
                <span className="text-foreground">{guide.pool.name ?? '—'}</span>
                {guide.pool.ticker ? (
                  <span className="ml-1 font-mono">{guide.pool.ticker}</span>
                ) : null}
                {guide.pool.rate_notes ? (
                  <span className="mt-1 block">{guide.pool.rate_notes}</span>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ac-last4">Last 4 digits</Label>
                <Input
                  id="ac-last4"
                  inputMode="numeric"
                  placeholder="optional"
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ac-points">Current points</Label>
                <Input
                  id="ac-points"
                  inputMode="numeric"
                  placeholder="optional"
                  value={points}
                  onChange={(e) => setPoints(e.target.value.replace(/[^\d]/g, ''))}
                  disabled={!ticker}
                />
              </div>
            </div>

            {liability ? (
              <p className="font-mono text-[11px] text-muted-foreground">{liability}</p>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button size="sm" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void submit()} disabled={!liability || busy}>
                {busy ? <Spinner className="size-4" /> : 'Add card'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
