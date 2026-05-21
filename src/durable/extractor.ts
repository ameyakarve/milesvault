export type ExtractResult =
  | { ok: true; r2_key: string; markdown_key: string; markdown: string; tokens: number; cached: boolean }
  | { ok: false; error: string; message: string }

const MARKDOWN_SUFFIX = '.md'

export async function extractFromR2(
  env: Cloudflare.Env,
  r2Key: string,
): Promise<ExtractResult> {
  const r2 = env.R2
  if (!r2) {
    return { ok: false, error: 'binding_missing', message: 'R2 binding missing' }
  }
  const markdownKey = `${r2Key}${MARKDOWN_SUFFIX}`

  const cached = await r2.get(markdownKey)
  if (cached) {
    const text = await cached.text()
    const tokens = Number(cached.customMetadata?.tokens ?? '0') || 0
    return {
      ok: true,
      r2_key: r2Key,
      markdown_key: markdownKey,
      markdown: text,
      tokens,
      cached: true,
    }
  }

  const source = await r2.get(r2Key)
  if (!source) {
    return {
      ok: false,
      error: 'not_found',
      message: `No object at key ${r2Key}`,
    }
  }
  const filename = source.customMetadata?.filename ?? r2Key.split('/').pop() ?? r2Key
  const blob = await source.blob()

  const ai = env.AI
  if (!ai) {
    return { ok: false, error: 'binding_missing', message: 'AI binding missing' }
  }
  const conv = await ai.toMarkdown({ name: filename, blob })
  if (conv.format === 'error') {
    return {
      ok: false,
      error: 'conversion_failed',
      message: conv.error ?? 'unknown error',
    }
  }
  const markdown = conv.data
  const tokens = conv.tokens ?? 0
  await r2.put(markdownKey, markdown, {
    httpMetadata: { contentType: 'text/markdown' },
    customMetadata: {
      source_key: r2Key,
      source_filename: filename,
      tokens: String(tokens),
    },
  })
  return {
    ok: true,
    r2_key: r2Key,
    markdown_key: markdownKey,
    markdown,
    tokens,
    cached: false,
  }
}
