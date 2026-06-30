// Discord messenger for the concierge — the principled counterpart to whatsapp.ts,
// on the SAME Cloudflare Think messenger framework: `getMessengers()` returns
// this, Think owns conversation routing + delivery, and each sender maps to their
// own concierge sub-agent (a facet keyed by their storage key — a separate thread
// from the web chat, reading the same ledger).
//
// Transport: Discord DMs arrive ONLY over the Gateway WebSocket (no HTTP/webhook
// for MESSAGE_CREATE), which a Cloudflare Worker can't hold open. So an external
// bridge runs `adapter.startGatewayListener(opts, …, webhookUrl)`, which holds the
// Gateway and FORWARDS each event to this webhook path; the adapter handles the
// forwarded event, the framework runs the turn, and the reply goes back out over
// the Discord REST API (bot token) — no round-trip through the bridge.
//
// Identity: the Discord snowflake IS our primary uid, so `resolveStorageKey` maps
// it straight to the durable storage key — no pairing code (unlike WhatsApp, whose
// wa_id is not the identity). conciergeEnabled is enforced by the sub-agent's
// beforeTurnFetch, exactly as on web/WhatsApp.
//
// Live only once DISCORD_BOT_TOKEN / DISCORD_PUBLIC_KEY / DISCORD_APPLICATION_ID
// are set; otherwise getMessengers omits it and nothing is exposed.

import { createDiscordAdapter } from '@chat-adapter/discord'
import { chatSdkMessenger, type MessengerEvent, type ThinkMessengers } from '@cloudflare/think/messengers'
import { resolveStorageKey } from '@/lib/identity'

// The path the bridge forwards Gateway events to. Think matches
// `definition.path === url.pathname` EXACTLY, so this must equal the path
// inject-do.mjs routes to the host DO and the bridge's webhookUrl.
export const DISCORD_WEBHOOK_PATH = '/api/discord/webhook'

type DiscordEnv = {
  DISCORD_BOT_TOKEN?: string
  DISCORD_PUBLIC_KEY?: string
  DISCORD_APPLICATION_ID?: string
  APP_ENV?: string
  D1?: D1Database
}

// Discord does NOT render `[label](url)` in normal DMs (only in embeds), and the
// adapter's renderPostable leaves them bracketed. Convert to Discord's tappable
// form: bare `<absolute-url>` (suppresses the preview), prefixed with the label.
// App-relative `/points?…` paths are absolutised against the origin.
function formatDiscordLinks(text: string, origin: string): string {
  const abs = (raw: string): string => {
    const u = raw.replace(/\\([&_*[\]()~`>])/g, '$1').trim()
    return u.startsWith('/') ? origin + u : u
  }
  return text
    .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) =>
      label.trim() ? `${label.trim()}: <${abs(url)}>` : `<${abs(url)}>`,
    )
    .replace(/<(\/[^>\s]+)>/g, (_m, url: string) => `<${abs(url)}>`)
}

// The host (ConciergeDO) — used to reset a paired user's sub-agent on /clear.
type MessengerHost = { clearMessengerThread: (key: string) => Promise<void> }

// Build the concierge's Discord messenger map. Returns {} until the bot secrets
// exist.
export function buildDiscordMessengers(env: DiscordEnv, host: MessengerHost): ThinkMessengers {
  const { DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY, DISCORD_APPLICATION_ID, D1 } = env
  if (!DISCORD_BOT_TOKEN || !DISCORD_PUBLIC_KEY || !DISCORD_APPLICATION_ID || !D1) {
    return {}
  }
  const db = D1
  const origin =
    env.APP_ENV === 'staging' ? 'https://staging.milesvault.com' : 'https://milesvault.com'

  const baseAdapter = createDiscordAdapter({
    botToken: DISCORD_BOT_TOKEN,
    publicKey: DISCORD_PUBLIC_KEY, // Ed25519 signature verification for webhooks
    applicationId: DISCORD_APPLICATION_ID,
    userName: 'MilesVault',
  })

  // Wrap renderPostable (the markdown→Discord boundary) to fix link presentation:
  // the adapter still does bold/italic/etc., then formatDiscordLinks converts
  // `[label](url)`/relative paths to tappable `<absolute-url>`. Everything else
  // delegates to baseAdapter via the prototype, with `this` bound correctly.
  const base = baseAdapter as unknown as {
    renderPostable: (message: unknown) => string
  }
  const renderPostable = base.renderPostable.bind(baseAdapter)
  const adapter = Object.create(baseAdapter) as typeof baseAdapter
  ;(adapter as unknown as { renderPostable: unknown }).renderPostable = (message: unknown): string =>
    formatDiscordLinks(renderPostable(message), origin)

  return {
    discord: chatSdkMessenger({
      adapter,
      provider: 'discord',
      userName: 'MilesVault',
      path: DISCORD_WEBHOOK_PATH,
      // The adapter verifies HTTP-interaction signatures itself (Ed25519 via
      // publicKey); forwarded Gateway events are authenticated at the edge in
      // inject-do (Bearer DISCORD_BRIDGE_SECRET) before reaching the host DO, so
      // Think's separate verifyWebhook layer is opted out. (chatSdkMessenger
      // requires this to be set explicitly.)
      verifyWebhook: false,
      // Map each sender to their own concierge sub-agent, keyed by storage key.
      // The snowflake is our uid, so resolveStorageKey is get-or-create and needs
      // no pairing step. conciergeEnabled is enforced downstream by the sub-agent.
      conversation: async (event: MessengerEvent) => {
        try {
          const snowflake =
            event.author?.userId || event.message?.author?.userId || ''
          const text = event.message?.text ?? ''
          if (!snowflake) return { target: 'self' as const }
          const key = await resolveStorageKey(db, snowflake)
          if (text.trim().toLowerCase() === '/clear') {
            await host
              .clearMessengerThread(key)
              .catch((e) => console.error('[discord] clear failed', { err: String(e) }))
          }
          return { target: 'subagent' as const, name: key }
        } catch (e) {
          console.error('[discord] resolver error', {
            err: String(e),
            stack: (e as Error)?.stack?.slice(0, 400),
          })
          return { target: 'self' as const }
        }
      },
    }),
  }
}
