import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'

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
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const body = (await req.json().catch((): null => null)) as FeedbackBody | null
  const message = body?.message?.trim()
  if (!message) return new NextResponse('message required', { status: 400 })

  const { env } = await getCloudflareContext({ async: true })
  const e = env as Cloudflare.Env
  const id = crypto.randomUUID()

  let imageKey: string | null = null
  if (typeof body?.image === 'string' && body.image.startsWith('data:image/') && e.R2) {
    try {
      const comma = body.image.indexOf(',')
      const contentType = body.image.slice(5, comma).split(';')[0] || 'image/jpeg'
      const bytes = Uint8Array.from(atob(body.image.slice(comma + 1)), (c) => c.charCodeAt(0))
      if (bytes.byteLength <= MAX_IMAGE_BYTES) {
        const ext = contentType === 'image/png' ? 'png' : 'jpg'
        imageKey = `feedback/${id}.${ext}`
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
         id         TEXT PRIMARY KEY,
         email      TEXT NOT NULL,
         message    TEXT NOT NULL,
         image_key  TEXT,
         page_url   TEXT,
         user_agent TEXT,
         created_at INTEGER NOT NULL
       )`,
    )
    .run()
  await db
    .prepare(
      `INSERT INTO feedback (id, email, message, image_key, page_url, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, session.user.email, message, imageKey, body?.url ?? null, body?.ua ?? null, Date.now())
    .run()

  return NextResponse.json({ ok: true })
}
