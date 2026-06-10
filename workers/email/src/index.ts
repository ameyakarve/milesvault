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
    prompt?: string | null
  }): Promise<{ ok: true }>
  match_email_rule(headers: { from: string; subject: string }): Promise<{
    action: 'capture' | 'ignore'
    prompt: string | null
    rule_id: number | null
  }>
}

// Transaction-alert emails are short; cap pathological bodies.
const MAX_BODY_CHARS = 20_000

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

    // Transaction emails only: text body, attachments ignored entirely.
    const parsed = await PostalMime.parse(message.raw)
    const body = (parsed.text?.trim() || htmlToText(parsed.html ?? ''))
      .trim()
      .slice(0, MAX_BODY_CHARS)
    if (!body) {
      message.setReject('empty message')
      return
    }

    const subject = parsed.subject?.trim() || 'forwarded email'
    const from = parsed.from?.address ?? message.from
    const stub = env.LEDGER_DO.get(env.LEDGER_DO.idFromName(row.email)) as unknown as LedgerStub

    // User-configured rules (experience.md §9): first enabled match wins.
    // 'ignore' = accept-and-drop (explicit user intent — OTPs, promos);
    // anything else captures, carrying the rule's prompt for review.
    const rule = await stub
      .match_email_rule({ from: from ?? '', subject })
      .catch(
        (): { action: 'capture'; prompt: string | null; rule_id: number | null } => ({
          action: 'capture',
          prompt: null,
          rule_id: null,
        }),
      )
    if (rule.action === 'ignore') {
      console.log('[email] ignored by rule', { rule_id: rule.rule_id })
      return
    }

    const id = `STMT-${crypto.randomUUID()}`
    await stub.put_statement({
      id,
      ownerEmail: row.email,
      filename: subject,
      text: `Forwarded transaction email\nFrom: ${from}\nSubject: ${subject}\n\n${body}`,
      source: 'email',
      prompt: rule.prompt,
    })
  },
} satisfies ExportedHandler<Env>
