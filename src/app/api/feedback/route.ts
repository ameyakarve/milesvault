import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { createLinearFeedbackIssue, type LinearEnv } from '@/lib/linear'

export const dynamic = 'force-dynamic'

type FeedbackBody = {
  message?: string
  image?: string | null // data URL (image/jpeg|png)
  url?: string
  ua?: string
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB — drop the shot (keep the message) if larger

// Beta feedback sink: a screenshot (R2) + a metadata row (D1). Store-only — an
// admin UI reads it later. Auth'd; the screenshot is best-effort (a failure to
// store it never blocks the written feedback).
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return new NextResponse('unauthorized', { status: 401 })

  const body = (await req.json().catch((): null => null)) as FeedbackBody | null
  const message = body?.message?.trim()
  if (!message) return new NextResponse('message required', { status: 400 })

  const { env, ctx } = await getCloudflareContext({ async: true })
  const e = env as Cloudflare.Env
  const id = crypto.randomUUID()
  const createdAt = Date.now()

  let imageKey: string | null = null
  let imageBytes: Uint8Array | null = null
  let imageContentType = 'image/jpeg'
  if (typeof body?.image === 'string' && body.image.startsWith('data:image/') && e.R2) {
    try {
      const comma = body.image.indexOf(',')
      const contentType = body.image.slice(5, comma).split(';')[0] || 'image/jpeg'
      const bytes = Uint8Array.from(atob(body.image.slice(comma + 1)), (c) => c.charCodeAt(0))
      if (bytes.byteLength <= MAX_IMAGE_BYTES) {
        const ext = contentType === 'image/png' ? 'png' : 'jpg'
        imageKey = `feedback/${id}.${ext}`
        imageBytes = bytes
        imageContentType = contentType
        await e.R2.put(imageKey, bytes, { httpMetadata: { contentType } })
      }
    } catch {
      imageKey = null // best-effort — keep the written feedback regardless
    }
  }

  const db = e.D1 as D1Database | undefined
  if (!db) return new NextResponse('D1 binding missing', { status: 500 })
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS feedback (
         id               TEXT PRIMARY KEY,
         email            TEXT NOT NULL,
         message          TEXT NOT NULL,
         image_key        TEXT,
         page_url         TEXT,
         user_agent       TEXT,
         created_at       INTEGER NOT NULL,
         linear_issue_id  TEXT,
         linear_issue_url TEXT
       )`,
    )
    .run()
  // Pre-existing tables predate the Linear columns — add them (no-op if present).
  await db.prepare(`ALTER TABLE feedback ADD COLUMN linear_issue_id TEXT`).run().catch(() => {})
  await db.prepare(`ALTER TABLE feedback ADD COLUMN linear_issue_url TEXT`).run().catch(() => {})
  await db
    .prepare(
      `INSERT INTO feedback (id, email, message, image_key, page_url, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, session.user.key, message, imageKey, body?.url ?? null, body?.ua ?? null, createdAt)
    .run()

  // File a Linear ticket out-of-band — never block (or fail) the feedback write
  // on it. On success, stamp the issue back onto the row so backfill skips it.
  const email = session.user.key
  ctx.waitUntil(
    (async () => {
      const issue = await createLinearFeedbackIssue(
        e as unknown as LinearEnv,
        {
          id,
          email,
          message,
          page_url: body?.url ?? null,
          user_agent: body?.ua ?? null,
          image_key: imageKey,
          created_at: createdAt,
        },
        imageBytes
          ? {
              bytes: imageBytes,
              contentType: imageContentType,
              filename: `${id}.${imageContentType === 'image/png' ? 'png' : 'jpg'}`,
            }
          : null,
      )
      if (issue) {
        await db
          .prepare(`UPDATE feedback SET linear_issue_id = ?, linear_issue_url = ? WHERE id = ?`)
          .bind(issue.id, issue.url, id)
          .run()
      }
    })(),
  )

  return NextResponse.json({ ok: true })
}
