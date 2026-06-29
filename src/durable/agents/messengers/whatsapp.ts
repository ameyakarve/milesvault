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
  D1?: D1Database
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

// Build the concierge's messenger map. Returns {} until the Meta secrets exist.
export function buildWhatsappMessengers(env: WhatsAppEnv): ThinkMessengers {
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

  const adapter = createWhatsAppAdapter({
    accessToken: WHATSAPP_ACCESS_TOKEN,
    appSecret: WHATSAPP_APP_SECRET, // webhook HMAC (X-Hub-Signature-256)
    phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: WHATSAPP_VERIFY_TOKEN, // GET hub.challenge handshake
    userName: 'MilesVault',
  })

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
        const waId = event.author?.userId
        if (!waId) return { target: 'self' as const }

        const paired = await lookupPairedKey(db, waId)
        if (paired) return { target: 'subagent' as const, name: paired }

        // Unpaired → try to redeem the message text as a pairing code.
        const code = CODE_RE.exec(event.message?.text ?? '')?.[1]
        if (code) {
          const linked = await redeemPairCode(db, waId, code)
          if (linked) return { target: 'subagent' as const, name: linked }
        }

        // Still unpaired: the host instance handles the "get a code from the app"
        // reply (see ConciergeDO's messenger-context handling).
        return { target: 'self' as const }
      },
    }),
  }
}
