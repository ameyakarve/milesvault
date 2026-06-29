import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

// Per-env BASE ingest address (localpart@domain); the per-user token is inserted as
// a `+subaddress`. Email Routing rules are apex-only (no subdomains), so staging and
// prod differ by LOCAL PART on the same domain, each with its own routing rule:
//   prod    INGEST_EMAIL_ADDRESS="ingest@milesvault.com"         → ingest+<token>@milesvault.com
//   staging INGEST_EMAIL_ADDRESS="ingest-staging@milesvault.com" → ingest-staging+<token>@milesvault.com
// The email worker's token regex is prefix-agnostic, so one worker codebase serves both.
function ingestAddress(env: unknown, token: string): string {
  const base = (env as { INGEST_EMAIL_ADDRESS?: string }).INGEST_EMAIL_ADDRESS || 'ingest@milesvault.com'
  const at = base.lastIndexOf('@')
  if (at < 0) return `ingest+${token}@milesvault.com`
  return `${base.slice(0, at)}+${token}@${base.slice(at + 1)}`
}

// The user's email-ingestion address (ledger-pipeline.md §5):
// ingest+<token>@milesvault.com. The token is a bearer secret minted once per
// user and stored in D1, where the milesvault-email worker resolves it back
// to the user at SMTP time. GET mints on first call, then returns the same
// address forever.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return new NextResponse('unauthorized', { status: 401 })
  const email = session.user.key

  const { env } = await getCloudflareContext({ async: true })
  const db = (env as Cloudflare.Env).D1 as D1Database | undefined
  if (!db) return new NextResponse('D1 binding missing', { status: 500 })

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ingest_tokens (
         token      TEXT PRIMARY KEY,
         email      TEXT NOT NULL,
         created_at INTEGER NOT NULL
       )`,
    )
    .run()
  // Bijection — one address per user. Dedupe any legacy multi-token rows (keep the
  // earliest), then a UNIQUE(email) index makes a second token per user impossible.
  // (One user per address is already guaranteed by token being PRIMARY KEY.)
  await db
    .prepare(
      `DELETE FROM ingest_tokens WHERE rowid NOT IN (SELECT MIN(rowid) FROM ingest_tokens GROUP BY email)`,
    )
    .run()
  await db
    .prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_ingest_tokens_email_uniq ON ingest_tokens(email)`,
    )
    .run()

  // Race-safe get-or-create: with UNIQUE(email), a concurrent second INSERT is
  // ignored, so both callers read back the one winning token.
  const token = crypto.randomUUID().replace(/-/g, '')
  await db
    .prepare('INSERT OR IGNORE INTO ingest_tokens (token, email, created_at) VALUES (?, ?, ?)')
    .bind(token, email, Date.now())
    .run()
  const rowTok = await db
    .prepare('SELECT token FROM ingest_tokens WHERE email = ?')
    .bind(email)
    .first<{ token: string }>()
  return NextResponse.json({ address: ingestAddress(env, rowTok?.token ?? token) })
}

// Rotate: burn every existing token for this user and mint a fresh one. The
// old address stops working at SMTP immediately (unknown-token reject) —
// the escape hatch for a leaked/spammed address.
export async function POST(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return new NextResponse('unauthorized', { status: 401 })
  const email = session.user.key

  const { env } = await getCloudflareContext({ async: true })
  const db = (env as Cloudflare.Env).D1 as D1Database | undefined
  if (!db) return new NextResponse('D1 binding missing', { status: 500 })

  const token = crypto.randomUUID().replace(/-/g, '')
  await db.batch([
    db.prepare('DELETE FROM ingest_tokens WHERE email = ?').bind(email),
    db
      .prepare('INSERT INTO ingest_tokens (token, email, created_at) VALUES (?, ?, ?)')
      .bind(token, email, Date.now()),
  ])
  return NextResponse.json({ address: ingestAddress(env, token), rotated: true })
}
