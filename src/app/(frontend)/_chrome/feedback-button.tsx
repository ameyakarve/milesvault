'use client'

import { useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { toJpeg } from 'html-to-image'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

// Floating beta-feedback widget: capture a screenshot of the page, attach it,
// and send it with a message. Capture happens BEFORE the modal opens; the FAB
// and modal are tagged `data-feedback-ignore` so the html-to-image filter keeps
// the feedback UI itself out of the shot. Store-only on the server (R2 + D1).
export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [shot, setShot] = useState<string | null>(null)
  const [attach, setAttach] = useState(true)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openFeedback() {
    setError(null)
    setDone(false)
    setMessage('')
    let dataUrl: string | null = null
    try {
      // JPEG (not PNG) keeps the payload small; the feedback UI is filtered out.
      dataUrl = await toJpeg(document.body, {
        quality: 0.85,
        pixelRatio: 1,
        cacheBust: true,
        filter: (node) =>
          !(node instanceof HTMLElement && node.dataset.feedbackIgnore === 'true'),
      })
    } catch {
      dataUrl = null // capture can fail on tainted/cross-origin content — send text-only
    }
    setShot(dataUrl)
    setAttach(!!dataUrl)
    setOpen(true)
  }

  async function send() {
    const text = message.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          image: attach ? shot : null,
          url: window.location.href,
          ua: navigator.userAgent,
        }),
      })
      if (!r.ok) {
        setError('Could not send — please try again.')
        return
      }
      setDone(true)
      setTimeout(() => setOpen(false), 1100)
    } catch {
      setError('Could not send — please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        data-feedback-ignore="true"
        onClick={openFeedback}
        aria-label="Send feedback"
        className="fixed bottom-4 right-4 z-50 flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground shadow-lg transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageSquarePlus className="size-4" />
        Feedback
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-feedback-ignore="true" className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
          </DialogHeader>

          {done ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Thanks — sent! 🙌</p>
          ) : (
            <div className="flex flex-col gap-3">
              <Textarea
                value={message}
                onChange={(ev) => setMessage(ev.target.value)}
                placeholder="What's working, what's broken, what's confusing…"
                rows={4}
                autoFocus
              />
              {shot ? (
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shot}
                    alt="Page screenshot"
                    className="h-24 w-auto rounded border border-border object-cover"
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={attach}
                      onChange={(ev) => setAttach(ev.target.checked)}
                    />
                    Attach this screenshot
                  </label>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Couldn&apos;t capture a screenshot — your message will still send.
                </p>
              )}
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
          )}

          {!done ? (
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={send} disabled={!message.trim() || sending}>
                {sending ? 'Sending…' : 'Send'}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
