const TTL_SECONDS = 300
const encoder = new TextEncoder()

type TokenPayload = {
  email: string
  exp: number
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function signChatToken(email: string, secret: string): Promise<TokenPayload & { token: string }> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
  const payload: TokenPayload = { email, exp }
  const payloadB64 = b64urlEncode(encoder.encode(JSON.stringify(payload)))
  const key = await hmacKey(secret)
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64)))
  const token = `${payloadB64}.${b64urlEncode(sig)}`
  return { ...payload, token }
}

export async function verifyChatToken(
  token: string,
  secret: string,
): Promise<TokenPayload | null> {
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const payloadB64 = token.slice(0, dot)
  const sigB64 = token.slice(dot + 1)
  let sig: Uint8Array
  try {
    sig = b64urlDecode(sigB64)
  } catch {
    return null
  }
  const key = await hmacKey(secret)
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64)))
  if (!timingSafeEqual(sig, expected)) return null
  let payload: TokenPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as TokenPayload
  } catch {
    return null
  }
  if (typeof payload.email !== 'string' || !payload.email.includes('@')) return null
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}
