# milesvault-telegram — read-only Assistant adapter

The Assistant surface over Telegram (docs/design/assistant-merge.md): pair a
chat with `/start <code>` (code minted on the Assistant page), then every
message is answered by `ConciergeDO.answerText` — the graph-walker brain with
read-only tools. The bot **never writes to the ledger**; anything write-shaped
belongs in the Inbox → Ledger chat flow.

Deploy (not part of the app's CI):

    pnpm exec wrangler deploy --config workers/telegram/wrangler.jsonc

## One-time bot setup (manual)

1. Telegram → **@BotFather** → `/newbot` → pick a name/username
   (e.g. `MilesVaultBot`). Copy the bot token.
2. Set the secrets:

       pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN --config workers/telegram/wrangler.jsonc
       pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET --config workers/telegram/wrangler.jsonc
       # webhook secret: any random string, e.g. `openssl rand -hex 16`

3. Point Telegram at the worker (once):

       curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
         -d "url=https://milesvault-telegram.ameyakarve.workers.dev/webhook" \
         -d "secret_token=<WEBHOOK_SECRET>"

4. Pair: Assistant page → "Use me on Telegram →" → send the `/start <code>`
   command to the bot.

v1 limitations (deliberate): text messages only (no photos — image intake is
parked); stateless single-turn answers (no conversation memory); production
ledgers only.
