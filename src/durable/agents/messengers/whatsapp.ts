// WhatsApp messenger for the concierge (docs/design/discord-identity.md is the
// identity model; this is the channel). Built on Cloudflare Think messengers:
// `getMessengers()` on ConciergeDO returns this, Think owns the webhook fiber,
// conversation routing, and streamed delivery. WhatsApp is 1:1 (one shared
// business number; users message it), so each sender maps to their own concierge
// sub-agent keyed by their storage key — a separate instance from the web chat,
// reading the same ledger.
//
// Pairing reuses the existing bot tables (the Telegram flow): the user mints a
// code in the web app and sends it as their first WhatsApp message; we link
// `whatsapp:<wa_id>` → their storage key, after which every message routes to
// their concierge.
//
// Live until the four Meta secrets are set (WHATSAPP_*); otherwise getMessengers
// returns {} and nothing is exposed.

import { createWhatsAppAdapter } from '@chat-adapter/whatsapp'
import { chatSdkMessenger, type MessengerEvent, type ThinkMessengers } from '@cloudflare/think/messengers'

const PAIR_TTL_MS = 15 * 60 * 1000
const CODE_RE = /\b([a-z0-9]{8})\b/i // 8-char codes minted by /api/bot/pairing-code

// The webhook URL Meta posts to. Think matches `definition.path === url.pathname`
// EXACTLY, so this must equal the path inject-do.mjs routes to the host DO and
// the Callback URL configured in the Meta app. (inject-do hardcodes the same.)
export const WHATSAPP_WEBHOOK_PATH = '/api/whatsapp/webhook'

type WhatsAppEnv = {
  WHATSAPP_ACCESS_TOKEN?: string
  WHATSAPP_APP_SECRET?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_VERIFY_TOKEN?: string
  APP_ENV?: string
  D1?: D1Database
}

// How to render the concierge's reply on WhatsApp. The adapter's renderPostable
// already did bold/italic/etc., but it mishandles links — it leaves `[label](url)`
// bracketed (escaping `&`→`\&`) and wraps bare URLs in `<…>`, neither of which is
// tappable. We fix that here AND pick the richer presentation:
//   - EXACTLY ONE link  → a native WhatsApp CTA-URL button (body text + a tappable
//                         button), the cleanest UX.
//   - zero or many      → inline plain text, each link as `label (absolute-url)`
//                         (WhatsApp auto-links the bare URL).
// App-relative `/points?…` paths are absolutised against the origin throughout.
type WhatsappOut =
  | { kind: 'text'; text: string }
  | { kind: 'cta'; body: string; displayText: string; url: string }

function formatWhatsappOut(text: string, origin: string): WhatsappOut {
  const abs = (raw: string): string => {
    const u = raw.replace(/\\([&_*[\]()~`>])/g, '$1').trim()
    return u.startsWith('/') ? origin + u : u
  }
  const MD = /\[([^\]]*)\]\(([^)\s]+)\)/g // [label](url)
  const AUTO = /<((?:https?:\/\/|\/)[^>\s]+)>/g // <url>
  const links: Array<{ label: string | null; url: string; raw: string }> = []
  for (const m of text.matchAll(MD)) links.push({ label: m[1] || null, url: abs(m[2]), raw: m[0] })
  for (const m of text.matchAll(AUTO)) links.push({ label: null, url: abs(m[1]), raw: m[0] })

  // CTA-URL buttons only support https + one URL; fall back to inline otherwise.
  if (links.length === 1 && links[0].url.startsWith('https://')) {
    const { label, url, raw } = links[0]
    let body = text.replaceAll(raw, '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim()
    if (!body) body = label ?? 'Open the link below.'
    const displayText = (label?.trim() || 'Open').slice(0, 20) // WhatsApp caps at 20
    return { kind: 'cta', body, displayText, url }
  }

  let out = text
  for (const m of text.matchAll(MD)) out = out.replaceAll(m[0], m[1] ? `${m[1]} (${abs(m[2])})` : abs(m[2]))
  for (const m of text.matchAll(AUTO)) out = out.replaceAll(m[0], abs(m[1]))
  return { kind: 'text', text: out }
}

// The bot pairing tables are created lazily by /api/bot/pairing-code; we only
// read bot_links and redeem from bot_pair_codes here.
async function lookupPairedKey(db: D1Database, waId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT email FROM bot_links WHERE chat_id = ?')
    .bind(`whatsapp:${waId}`)
    .first<{ email: string }>()
  return row?.email ?? null // the `email` column holds the storage key
}

// Redeem a pairing code as the sender's first message: validate (exists, unexpired),
// link whatsapp:<waId> → storage key, burn the code. Returns the linked key or null.
async function redeemPairCode(db: D1Database, waId: string, code: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT email, created_at FROM bot_pair_codes WHERE code = ?')
    .bind(code.toLowerCase())
    .first<{ email: string; created_at: number }>()
  if (!row || Date.now() - row.created_at > PAIR_TTL_MS) return null
  await db.batch([
    db
      .prepare(
        `INSERT INTO bot_links (chat_id, email, created_at) VALUES (?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET email = excluded.email, created_at = excluded.created_at`,
      )
      .bind(`whatsapp:${waId}`, row.email, Date.now()),
    db.prepare('DELETE FROM bot_pair_codes WHERE code = ?').bind(code.toLowerCase()),
  ])
  return row.email
}

// The host (ConciergeDO) — used to reset a paired user's sub-agent on /clear.
type MessengerHost = { clearMessengerThread: (key: string) => Promise<void> }

// Build the concierge's messenger map. Returns {} until the Meta secrets exist.
export function buildWhatsappMessengers(env: WhatsAppEnv, host: MessengerHost): ThinkMessengers {
  const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, D1 } = env
  if (
    !WHATSAPP_ACCESS_TOKEN ||
    !WHATSAPP_APP_SECRET ||
    !WHATSAPP_PHONE_NUMBER_ID ||
    !WHATSAPP_VERIFY_TOKEN ||
    !D1
  ) {
    return {}
  }
  const db = D1

  const origin =
    env.APP_ENV === 'staging' ? 'https://staging.milesvault.com' : 'https://milesvault.com'

  const baseAdapter = createWhatsAppAdapter({
    accessToken: WHATSAPP_ACCESS_TOKEN,
    appSecret: WHATSAPP_APP_SECRET, // webhook HMAC (X-Hub-Signature-256)
    phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: WHATSAPP_VERIFY_TOKEN, // GET hub.challenge handshake
    userName: 'MilesVault',
  })

  // Wrap the adapter at its final text-send boundary: renderPostable still does
  // the markdown→WhatsApp work (bold/italic/…), then formatWhatsappOut decides
  // link presentation — a CTA-URL button for a single link, else inline. The
  // CTA send is a raw Graph API call (the adapter exposes no cta_url helper);
  // any failure falls back to plain text. Everything else delegates to
  // baseAdapter via the prototype, with `this` bound correctly.
  const base = baseAdapter as unknown as {
    sendTextMessage: (threadId: string, to: string, text: string) => Promise<unknown>
    graphApiRequest: (path: string, body: unknown) => Promise<unknown>
  }
  const sendText = base.sendTextMessage.bind(baseAdapter)
  const graphApiRequest = base.graphApiRequest.bind(baseAdapter)
  const adapter = Object.create(baseAdapter) as typeof baseAdapter
  ;(adapter as unknown as { sendTextMessage: unknown }).sendTextMessage = async (
    threadId: string,
    to: string,
    text: string,
  ) => {
    const out = formatWhatsappOut(text, origin)
    if (out.kind === 'cta') {
      try {
        return await graphApiRequest(`/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'cta_url',
            body: { text: out.body },
            action: { name: 'cta_url', parameters: { display_text: out.displayText, url: out.url } },
          },
        })
      } catch (e) {
        console.error('[wa] cta_url failed — falling back to text', { err: String(e) })
        return sendText(threadId, to, `${out.body}\n${out.url}`)
      }
    }
    return sendText(threadId, to, out.text)
  }

  return {
    whatsapp: chatSdkMessenger({
      adapter,
      provider: 'whatsapp',
      userName: 'MilesVault',
      path: WHATSAPP_WEBHOOK_PATH,
      // The adapter verifies the POST signature (X-Hub-Signature-256 via
      // appSecret) and the GET hub.challenge handshake itself, so we opt out of
      // Think's separate verifyWebhook layer. (chatSdkMessenger requires this to
      // be set explicitly.) The GET handshake is answered in inject-do, since
      // Think's handleRequest 405s non-POST.
      verifyWebhook: false,
      // Map each sender to their own concierge sub-agent, keyed by their storage
      // key. Pairing is handled inline: an unpaired sender's first message is
      // treated as a pairing code.
      conversation: async (event: MessengerEvent) => {
        try {
          // The sender's wa_id. `event.author.userId` can be empty for WhatsApp;
          // the reliable source is the thread id `whatsapp:<phoneNumberId>:<wa_id>`.
          const waId =
            event.author?.userId ||
            event.message?.author?.userId ||
            event.thread?.id?.split(':').pop() ||
            ''
          const text = event.message?.text ?? ''
          console.log('[wa] inbound', { waId, textLen: text.length })
          if (!waId) return { target: 'self' as const }

          const paired = await lookupPairedKey(db, waId)
          if (paired) {
            // `/clear` resets the conversation: wipe the user's sub-agent history
            // so the next message starts fresh. The (now-empty) sub-agent then
            // handles the `/clear` message and replies per the prompt.
            if (text.trim().toLowerCase() === '/clear') {
              console.log('[wa] /clear', { waId })
              await host.clearMessengerThread(paired).catch((e) =>
                console.error('[wa] clear failed', { err: String(e) }),
              )
            }
            return { target: 'subagent' as const, name: paired }
          }

          // Unpaired → try to redeem the message text as a pairing code.
          const code = CODE_RE.exec(text)?.[1]
          console.log('[wa] unpaired', { codeFound: code ?? null })
          if (code) {
            const linked = await redeemPairCode(db, waId, code)
            console.log('[wa] redeem result', { linked: linked ? linked.slice(0, 12) + '…' : null })
            if (linked) return { target: 'subagent' as const, name: linked }
          }

          // Still unpaired: the host instance handles the "get a code" reply.
          return { target: 'self' as const }
        } catch (e) {
          console.error('[wa] resolver error', { err: String(e), stack: (e as Error)?.stack?.slice(0, 400) })
          return { target: 'self' as const }
        }
      },
    }),
  }
}
