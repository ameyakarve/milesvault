import PostalMime from 'postal-mime'

// Email ingestion worker (ledger-pipeline.md §5, experience.md §9).
//
// One Email Routing rule — ingest@milesvault.com → this worker — serves every
// user via plus-addressing: ingest+<token>@milesvault.com. The token is a
// bearer secret minted by the app (/api/ledger/forwarding-address) and stored
// in D1; it is the ONLY trust boundary — unknown tokens are rejected at SMTP
// time so the domain isn't a spam sink, and a user rotates the token to revoke.
// There is no sender allow/deny list: knowing the secret address IS the grant.
//
// A valid message lands as a `captured` item (source 'email') in the user's
// LedgerDO, then drafts on its OWN per-email ChatDO (email::<id>) — exactly the
// statement-upload path. Never auto-posted; review happens in the Inbox.

// Minimal local types: this worker compiles standalone, without the app's
// generated env types.
type LedgerStub = {
  put_statement(opts: {
    id: string
    ownerEmail: string
    filename: string
    text: string
    source: 'upload' | 'email'
    prompt?: string | null
  }): Promise<{ ok: true }>
  record_ingest(entry: {
    from_addr: string | null
    subject: string | null
    outcome: 'captured' | 'ignored' | 'rejected'
    rule_id?: number | null
    capture_id?: string | null
    body_excerpt?: string | null
  }): Promise<{ ok: true }>
}

// The per-email ChatDO: same instance the Inbox review chat uses (email::<id>).
// `setName` pins its identity (owner + capture id); `draftStatementAsync`
// schedules the headless draft on the DO's own alarm and returns immediately.
type ChatStub = {
  setName(name: string): Promise<unknown>
  draftStatementAsync(statementId: string): Promise<{ ok: boolean; entries: number }>
}

// Transaction-alert emails are short; cap pathological bodies.
const MAX_BODY_CHARS = 20_000

export interface Env {
  LEDGER_DO: DurableObjectNamespace
  CHAT_DO: DurableObjectNamespace
  DB: D1Database
}

const TOKEN_RE = /^ingest\+([a-z0-9]{16,64})@/i

// Crude fallback when a message has no text part.
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

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const m = TOKEN_RE.exec(message.to ?? '')
    if (!m) {
      message.setReject('unknown address')
      return
    }
    // The secret +token IS the trust boundary: an unknown token is rejected.
    const row = await env.DB.prepare('SELECT email FROM ingest_tokens WHERE token = ?')
      .bind(m[1].toLowerCase())
      .first<{ email: string }>()
    if (!row) {
      message.setReject('unknown address')
      return
    }

    // Transaction emails only: text body, attachments ignored entirely.
    const parsed = await PostalMime.parse(message.raw)
    const body = (parsed.text?.trim() || htmlToText(parsed.html ?? ''))
      .trim()
      .slice(0, MAX_BODY_CHARS)
    const subject = parsed.subject?.trim() || 'forwarded email'
    const from = parsed.from?.address ?? message.from
    const stub = env.LEDGER_DO.get(env.LEDGER_DO.idFromName(row.email)) as unknown as LedgerStub
    const log = (entry: Parameters<LedgerStub['record_ingest']>[0]) =>
      stub.record_ingest(entry).catch(() => {})

    if (!body) {
      await log({ from_addr: from ?? null, subject, outcome: 'rejected' })
      message.setReject('empty message')
      return
    }

    // Land the capture in the user's LedgerDO (cheap), then draft it on its OWN
    // per-email ChatDO (email::<id>) — the same headless path statement uploads
    // use. One email → one capture → one DO (bijective). No sender vetting: the
    // secret address already gated entry.
    const id = `STMT-${crypto.randomUUID()}`
    await stub.put_statement({
      id,
      ownerEmail: row.email,
      filename: subject,
      text: `Forwarded transaction email\nFrom: ${from}\nSubject: ${subject}\n\n${body}`,
      source: 'email',
      prompt: null,
    })
    await log({
      from_addr: from ?? null,
      subject,
      outcome: 'captured',
      capture_id: id,
      body_excerpt: body.slice(0, 2000),
    })

    // Kick the headless draft. `draftStatementAsync` only schedules an alarm and
    // returns, so this is quick; waitUntil keeps it from blocking the SMTP ack
    // while still guaranteeing it runs. Best-effort — a draft failure must not
    // bounce the email (the capture is already saved; the Inbox can re-draft).
    const threadName = `${row.email}::${id}`
    const chat = env.CHAT_DO.get(env.CHAT_DO.idFromName(threadName)) as unknown as ChatStub
    ctx.waitUntil(
      chat
        .setName(threadName)
        .then(() => chat.draftStatementAsync(id))
        .then((): undefined => undefined)
        .catch((): undefined => undefined),
    )
  },
} satisfies ExportedHandler<Env>
