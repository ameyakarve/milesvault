import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import PostalMime from 'postal-mime'
import type { LedgerDO } from '@/durable/ledger-do'
import type { ChatDO } from '@/durable/chat-do'

export const dynamic = 'force-dynamic'

// Forward Email inbound webhook — the DMARC-tolerant replacement for the
// Cloudflare Email Worker (which CF Email Routing rejected before it ran, on the
// forwarded sender's DMARC). Forward Email accepts the mail and POSTs it here;
// the `+token` is the trust boundary, as always. One valid message → a `captured`
// item in the user's LedgerDO → a headless draft on its per-email ChatDO. Same
// pipeline the statement upload + old email worker used.

// Prefix-agnostic: `<localpart>+<token>@…` (prod `ingest+…`, staging `ingest-staging+…`).
const TOKEN_RE = /\+([a-z0-9]{16,64})@/i
const MAX_BODY_CHARS = 20_000
const RATE_LIMIT_PER_HOUR = 30 // per token; excess is dropped (logged, not bounced)

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// HMAC-SHA256(rawBody, key) as lowercase hex, constant-time compared to the header.
async function verifySignature(rawBody: string, header: string | null, key: string): Promise<boolean> {
  if (!header) return false
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(rawBody))
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  // Header may be "sha256=<hex>" or bare hex.
  const got = header.trim().replace(/^sha256=/i, '').toLowerCase()
  if (got.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

// Collect every candidate recipient string from the (loosely-typed) Forward Email
// payload — the +token lives in the ENVELOPE recipient (esp. for auto-forwards,
// where the To: header is the user's own address), so check all the likely fields.
function recipientCandidates(p: Record<string, unknown>): string[] {
  const out: string[] = []
  const push = (v: unknown): void => {
    if (!v) return
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(push)
    else if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.address === 'string') out.push(o.address)
      if (typeof o.text === 'string') out.push(o.text)
      if (Array.isArray(o.value)) o.value.forEach(push)
    }
  }
  push(p.recipients)
  push(p.recipient)
  push(p.to)
  push(p.cc)
  return out
}

export async function POST(req: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true })
  const cf = env as unknown as {
    FORWARDEMAIL_WEBHOOK_KEY?: string
    D1?: D1Database
    LEDGER_DO?: DurableObjectNamespace<LedgerDO>
    CHAT_DO?: DurableObjectNamespace<ChatDO>
  }
  const key = cf.FORWARDEMAIL_WEBHOOK_KEY
  if (!key || !cf.D1 || !cf.LEDGER_DO || !cf.CHAT_DO) {
    return new NextResponse('not configured', { status: 503 })
  }

  const rawBody = await req.text()
  const sig = req.headers.get('X-Webhook-Signature') ?? req.headers.get('x-webhook-signature')
  if (!(await verifySignature(rawBody, sig, key))) {
    // Self-diagnosing for the first real test: which header did FE actually send?
    console.warn('[email-ingest] signature check failed', {
      hasHeader: !!sig,
      headerNames: [...req.headers.keys()].filter((h) => /sign|webhook|hmac/i.test(h)),
    })
    return new NextResponse('bad signature', { status: 403 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return new NextResponse('bad json', { status: 400 })
  }

  // Token from the envelope recipient (the trust boundary).
  let token: string | null = null
  for (const r of recipientCandidates(payload)) {
    const m = TOKEN_RE.exec(r)
    if (m) {
      token = m[1].toLowerCase()
      break
    }
  }
  // Fallback: parse the raw MIME and check its delivery headers.
  const raw = typeof payload.raw === 'string' ? payload.raw : null
  let parsed: Awaited<ReturnType<typeof PostalMime.parse>> | null = null
  if (raw) {
    try {
      parsed = await PostalMime.parse(raw)
    } catch {
      parsed = null
    }
  }
  if (!token && parsed) {
    const toAddrs = (parsed.to ?? []) as Array<{ address?: string }>
    const deliveredTo = ((parsed.headers ?? []) as Array<{ key: string; value: string }>).find((h) =>
      /^(delivered-to|x-original-to|x-forwarded-to)$/i.test(h.key),
    )?.value
    const hdrAddrs: string[] = [...toAddrs.map((a) => a.address ?? ''), String(deliveredTo ?? '')]
    for (const r of hdrAddrs) {
      const m = TOKEN_RE.exec(r)
      if (m) {
        token = m[1].toLowerCase()
        break
      }
    }
  }
  if (!token) {
    console.warn('[email-ingest] no token in recipients', { payloadKeys: Object.keys(payload) })
    return NextResponse.json({ ok: true, outcome: 'ignored' }) // accept + drop, no bounce
  }

  // Resolve the token → owner email (the only trust check).
  const row = await cf.D1.prepare('SELECT email FROM ingest_tokens WHERE token = ?')
    .bind(token)
    .first<{ email: string }>()
  if (!row) {
    return NextResponse.json({ ok: true, outcome: 'ignored' }) // unknown token → silent drop
  }
  const email = row.email

  // Per-token hourly rate limit (abuse control). Excess is dropped, not bounced.
  await cf.D1.prepare(
    'CREATE TABLE IF NOT EXISTS ingest_rate (token TEXT NOT NULL, ts INTEGER NOT NULL)',
  ).run()
  const cutoff = Date.now() - 3_600_000
  await cf.D1.prepare('DELETE FROM ingest_rate WHERE ts < ?').bind(cutoff).run()
  const recent = await cf.D1.prepare('SELECT COUNT(*) AS n FROM ingest_rate WHERE token = ? AND ts >= ?')
    .bind(token, cutoff)
    .first<{ n: number }>()
  if ((recent?.n ?? 0) >= RATE_LIMIT_PER_HOUR) {
    console.warn('[email-ingest] rate limit', { token: token.slice(0, 6), n: recent?.n })
    return NextResponse.json({ ok: true, outcome: 'rate_limited' })
  }
  // Count this message toward the token's hourly budget.
  await cf.D1.prepare('INSERT INTO ingest_rate (token, ts) VALUES (?, ?)').bind(token, Date.now()).run()

  // Body: prefer the raw MIME (parsed above), else the payload's parsed parts.
  const body = (
    parsed?.text?.trim() ||
    htmlToText(parsed?.html ?? '') ||
    (typeof payload.text === 'string' ? payload.text : '') ||
    htmlToText(typeof payload.html === 'string' ? payload.html : '')
  )
    .trim()
    .slice(0, MAX_BODY_CHARS)
  const subject =
    parsed?.subject?.trim() || (typeof payload.subject === 'string' ? payload.subject.trim() : '') || 'forwarded email'
  const from =
    parsed?.from?.address ??
    (typeof payload.from === 'string'
      ? payload.from
      : ((payload.from as { address?: string } | undefined)?.address ?? null))

  const ledger = cf.LEDGER_DO.get(cf.LEDGER_DO.idFromName(email))
  const log = (outcome: 'captured' | 'ignored' | 'rejected', capture_id?: string): void => {
    void ledger
      .record_ingest({ from_addr: from, subject, outcome, capture_id: capture_id ?? null, body_excerpt: body.slice(0, 2000) })
      .catch(() => {})
  }

  if (!body) {
    log('rejected')
    return NextResponse.json({ ok: true, outcome: 'rejected' })
  }

  const id = `STMT-${crypto.randomUUID()}`
  await ledger.put_statement({
    id,
    ownerEmail: email,
    filename: subject,
    text: `Forwarded transaction email\nFrom: ${from}\nSubject: ${subject}\n\n${body}`,
    source: 'email',
    prompt: null,
  })
  log('captured', id)

  // Kick the headless draft on the per-email ChatDO (email::<id>) — best-effort;
  // draftStatementAsync only schedules an alarm, so it returns fast.
  const threadName = `${email}::${id}`
  const chat = cf.CHAT_DO.get(cf.CHAT_DO.idFromName(threadName))
  await chat
    .setName(threadName)
    .then(() => chat.draftStatementAsync(id))
    .catch(() => {})

  return NextResponse.json({ ok: true, outcome: 'captured', id })
}
