import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

// The user's email-ingestion address (ledger-pipeline.md §5):
// ingest+<token>@milesvault.com. The token is a bearer secret minted once per
// user and stored in D1, where the milesvault-email worker resolves it back
// to the user at SMTP time. GET mints on first call, then returns the same
// address forever.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const email = session.user.email

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
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_ingest_tokens_email ON ingest_tokens(email)`)
    .run()

  const existing = await db
    .prepare('SELECT token FROM ingest_tokens WHERE email = ? LIMIT 1')
    .bind(email)
    .first<{ token: string }>()
  if (existing) {
    return NextResponse.json({ address: `ingest+${existing.token}@milesvault.com` })
  }

  const token = crypto.randomUUID().replace(/-/g, '')
  await db
    .prepare('INSERT INTO ingest_tokens (token, email, created_at) VALUES (?, ?, ?)')
    .bind(token, email, Date.now())
    .run()
  return NextResponse.json({ address: `ingest+${token}@milesvault.com` })
}
