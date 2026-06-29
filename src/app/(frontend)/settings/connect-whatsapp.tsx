'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

// "Connect WhatsApp" — mints a pairing code (POST /api/bot/pairing-code) and, if
// WhatsApp is configured server-side, hands back a wa.me deep link with the code
// pre-filled. The user taps it, WhatsApp opens to the business number with the
// code ready, they hit send → linked. The code (15-min TTL) is shown as a manual
// fallback. Membership/kill-switch gating is enforced by the endpoint (403).
export function ConnectWhatsApp() {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ready'; code: string; link: string | null }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  async function mint() {
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/bot/pairing-code', { method: 'POST' })
      if (!res.ok) {
        setState({
          kind: 'error',
          message: res.status === 403 ? 'The assistant is not enabled for your account yet.' : 'Could not generate a code — try again.',
        })
        return
      }
      const data = (await res.json()) as { code: string; whatsapp?: { link: string } | null }
      setState({ kind: 'ready', code: data.code, link: data.whatsapp?.link ?? null })
    } catch {
      setState({ kind: 'error', message: 'Could not generate a code — try again.' })
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-foreground">WhatsApp</p>
          <p className="text-xs text-muted-foreground">
            Ask the concierge from WhatsApp. Generate a code, then tap to open a chat with it pre-filled.
          </p>
        </div>
        {state.kind !== 'ready' && (
          <Button type="button" size="sm" onClick={mint} disabled={state.kind === 'loading'}>
            {state.kind === 'loading' ? 'Generating…' : 'Connect'}
          </Button>
        )}
      </div>

      {state.kind === 'error' && <p className="mt-3 text-xs text-destructive">{state.message}</p>}

      {state.kind === 'ready' && (
        <div className="mt-3 flex flex-col gap-2">
          {state.link ? (
            <a
              href={state.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open WhatsApp to link
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              WhatsApp isn’t configured yet — send this code to our WhatsApp number to link.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Code (valid 15 min): <span className="font-mono text-foreground">{state.code}</span>
          </p>
        </div>
      )}
    </div>
  )
}
