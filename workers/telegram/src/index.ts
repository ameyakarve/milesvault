// Telegram adapter for the Assistant surface (docs/design/assistant-merge.md):
// the text/image-native Assistant runs identically on web and bots, and bots
// never write to the ledger. This worker handles the Telegram webhook:
//
//   /start <code>  → pair this chat to a MilesVault account (code minted by
//                    /api/bot/pairing-code, 15-minute TTL, single use)
//   anything else  → ConciergeDO.answerText for the paired user
//
// Webhook authenticity: Telegram echoes the secret_token passed to
// setWebhook in X-Telegram-Bot-Api-Secret-Token; mismatches are dropped.

type ConciergeStub = { answerText(question: string): Promise<{ text: string }> }

export interface Env {
  CONCIERGE_DO: DurableObjectNamespace
  DB: D1Database
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_WEBHOOK_SECRET: string
}

type TgUpdate = {
  message?: {
    text?: string
    chat?: { id: number }
  }
}

const PAIR_TTL_MS = 15 * 60 * 1000

async function send(env: Env, chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
  }).catch(() => {})
}

async function handleMessage(env: Env, chatId: number, text: string): Promise<void> {
  const start = /^\/start(?:\s+([A-Za-z0-9]+))?/.exec(text)
  if (start) {
    const code = start[1]
    if (!code) {
      await send(
        env,
        chatId,
        'Hi! To link your MilesVault account, get a pairing code from the Assistant page at milesvault.com and send: /start <code>',
      )
      return
    }
    const row = await env.DB.prepare(
      'SELECT email, created_at FROM bot_pair_codes WHERE code = ?',
    )
      .bind(code.toLowerCase())
      .first<{ email: string; created_at: number }>()
    if (!row || Date.now() - row.created_at > PAIR_TTL_MS) {
      await send(env, chatId, 'That code is invalid or expired — mint a fresh one from the Assistant page.')
      return
    }
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO bot_links (chat_id, email, created_at) VALUES (?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET email = excluded.email, created_at = excluded.created_at`,
      ).bind(String(chatId), row.email, Date.now()),
      env.DB.prepare('DELETE FROM bot_pair_codes WHERE code = ?').bind(code.toLowerCase()),
    ])
    await send(env, chatId, `Linked. Ask me anything about cards, points, transfers, or your own balances. I never change your ledger from here — anything that needs a write goes to your Inbox.`)
    return
  }

  const link = await env.DB.prepare('SELECT email FROM bot_links WHERE chat_id = ?')
    .bind(String(chatId))
    .first<{ email: string }>()
  if (!link) {
    await send(
      env,
      chatId,
      'This chat isn’t linked yet. Get a pairing code from the Assistant page at milesvault.com, then send: /start <code>',
    )
    return
  }

  const stub = env.CONCIERGE_DO.get(
    env.CONCIERGE_DO.idFromName(link.email),
  ) as unknown as ConciergeStub
  try {
    const { text: answer } = await stub.answerText(text)
    await send(env, chatId, answer)
  } catch (e) {
    console.error('[telegram] answerText failed', { err: String(e) })
    await send(env, chatId, 'Something went wrong answering that — try again in a moment.')
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method !== 'POST' || new URL(req.url).pathname !== '/webhook') {
      return new Response('not found', { status: 404 })
    }
    if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response('forbidden', { status: 403 })
    }
    let update: TgUpdate
    try {
      update = (await req.json()) as TgUpdate
    } catch {
      return new Response('bad request', { status: 400 })
    }
    const chatId = update.message?.chat?.id
    const text = update.message?.text?.trim()
    // Ack immediately; Telegram retries slow webhooks. The answer (model loop
    // + tools) runs in waitUntil and replies via sendMessage.
    if (chatId && text) ctx.waitUntil(handleMessage(env, chatId, text))
    return new Response('ok')
  },
} satisfies ExportedHandler<Env>
