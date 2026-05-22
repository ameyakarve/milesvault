import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { extractFromR2 } from '@/durable/extractor'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 25 * 1024 * 1024

export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) {
    return new NextResponse('unauthorized', { status: 401 })
  }
  const email = session.user.email

  const form = await req.formData().catch((): FormData | null => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'file (multipart) required' },
      { status: 400 },
    )
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'empty file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (>${MAX_BYTES} bytes)` },
      { status: 413 },
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const sha256 = await sha256Hex(bytes)
  const userKey = await sha256Hex(new TextEncoder().encode(email))
  const r2Key = `agent/${userKey.slice(0, 16)}/${sha256}`

  const { env } = await getCloudflareContext({ async: true })
  const cfEnv = env as Cloudflare.Env
  const r2 = cfEnv.R2
  if (!r2) {
    return new NextResponse('R2 binding missing', { status: 500 })
  }
  const contentType = file.type || 'application/octet-stream'
  await r2.put(r2Key, bytes, {
    httpMetadata: {
      contentType,
      contentDisposition: `attachment; filename="${file.name.replace(/"/g, '')}"`,
    },
    customMetadata: { email, filename: file.name },
  })

  const extracted = await extractFromR2(cfEnv, r2Key)
  if (extracted.ok === false) {
    return NextResponse.json(
      { error: extracted.error, message: extracted.message },
      { status: 502 },
    )
  }

  return NextResponse.json({
    r2_key: r2Key,
    content_type: contentType,
    size: file.size,
    filename: file.name,
    markdown: extracted.markdown,
    tokens: extracted.tokens,
  })
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const arr = new Uint8Array(digest)
  let out = ''
  for (let i = 0; i < arr.length; i++) {
    out += arr[i]!.toString(16).padStart(2, '0')
  }
  return out
}
