import PostalMime from 'postal-mime'

// Email ingestion worker (ledger-pipeline.md §5, experience.md §9).
//
// One Email Routing rule — ingest@milesvault.com → this worker — serves every
// user via plus-addressing: ingest+<token>@milesvault.com. The token is a
// bearer secret minted by the app (/api/ledger/forwarding-address) and stored
// in D1; unknown tokens are rejected at SMTP time so the domain isn't a spam
// sink. A valid message lands as a `captured` item (source 'email') in the
// user's Inbox — never auto-posted; review happens in the Journal chat.

// Minimal local types: this worker compiles standalone, without the app's
// generated env types.
type LedgerStub = {
  put_statement(opts: {
    id: string
    ownerEmail: string
    filename: string
    text: string
    source: 'upload' | 'email'
  }): Promise<{ ok: true }>
}

export interface Env {
  LEDGER_DO: DurableObjectNamespace
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
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const m = TOKEN_RE.exec(message.to ?? '')
    if (!m) {
      message.setReject('unknown address')
      return
    }
    const row = await env.DB.prepare('SELECT email FROM ingest_tokens WHERE token = ?')
      .bind(m[1].toLowerCase())
      .first<{ email: string }>()
    if (!row) {
      message.setReject('unknown address')
      return
    }

    const parsed = await PostalMime.parse(message.raw)
    const body = (parsed.text?.trim() || htmlToText(parsed.html ?? '')).trim()
    const attachmentNote = parsed.attachments?.length
      ? `\n\n[${parsed.attachments.length} attachment(s) not ingested: ${parsed.attachments
          .map((a) => a.filename ?? a.mimeType)
          .join(', ')} — attachment extraction lands with R2 capture]`
      : ''
    if (!body && !attachmentNote) {
      message.setReject('empty message')
      return
    }

    const subject = parsed.subject?.trim() || 'forwarded email'
    const from = parsed.from?.address ?? message.from
    const id = `STMT-${crypto.randomUUID()}`
    const stub = env.LEDGER_DO.get(env.LEDGER_DO.idFromName(row.email)) as unknown as LedgerStub
    await stub.put_statement({
      id,
      ownerEmail: row.email,
      filename: subject,
      text: `Forwarded email\nFrom: ${from}\nSubject: ${subject}\n\n${body}${attachmentNote}`,
      source: 'email',
    })
  },
} satisfies ExportedHandler<Env>
