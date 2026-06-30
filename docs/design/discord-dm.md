# Discord DM concierge

Members message the MilesVault bot directly on Discord (a normal DM, not a slash
command) and get a concierge reply — the same agent as the in-app chat and
WhatsApp, over the same per-user ledger.

## Why a bridge exists (and isn't on Cloudflare)

Everything else in MilesVault runs on Cloudflare Workers. The Discord DM path is
the one exception, for a hard platform reason:

- **Discord has no HTTP/webhook path for message text.** Its outgoing webhook
  supports only ~10 event types (`APPLICATION_AUTHORIZED`, `ENTITLEMENT_*`,
  `LOBBY_MESSAGE_*`, `GAME_DIRECT_MESSAGE_*`, …) — **none of which is
  `MESSAGE_CREATE`**. Normal DMs are delivered *only* over the Gateway, a
  persistent WebSocket the app must hold open. (Contrast WhatsApp, which *pushes*
  inbound messages to an HTTP webhook — that's why the WhatsApp concierge is pure
  Workers and this one can't be.)
- **No Cloudflare primitive holds a persistent outbound WebSocket.** Durable
  Object outbound sockets can't use the Hibernation API and the DO is evicted
  ~15 min after the connection goes idle; Containers are ephemeral/auto-sleep;
  Workers have no persistent connections at all. So the Gateway socket must be
  held by an always-on process *off* Cloudflare.

The socket holder does **not** need to be the agent. The Durable Object stays
event-driven, as always. Only a thin, stateless holder needs to be always-on —
so that's all the bridge is.

## Shape

```
Discord DM ──(Gateway WS)──▶  bridge (OCI box, always on)
                                  │  POST /api/discord/dm  { snowflake, text }
                                  ▼
                            Worker (inject-do.mjs)
                                  ├─ Bearer DISCORD_BRIDGE_SECRET  (trust boundary)
                                  ├─ resolveStorageKey(snowflake)  → storage key
                                  ├─ conciergeEnabled gate         (fail-closed)
                                  └─ ConciergeDO(key).answerText(text) → { text }
                                  │  reply text
                                  ▼
Discord DM ◀──(channel.send)──  bridge
```

- **`bridge/discord-dm/`** — ~40 lines of `discord.js`. Holds the Gateway,
  forwards each inbound DM to the Worker, sends the reply back (chunked to
  Discord's 2000-char cap). No business logic, no state. Runs under systemd on an
  OCI Always Free box (`VM.Standard.E2.1.Micro`). Outbound-only — no inbound
  ports.
- **`POST /api/discord/dm`** (in `scripts/inject-do.mjs`, beside the WhatsApp
  webhook) — does identity resolution, gating, and the concierge turn.

## Identity

The Discord **snowflake is the identity** — the same primary key the web login
uses (see `discord-identity.md`). There is **no pairing step**: `resolveStorageKey`
maps the snowflake to the user's durable storage key (their email for migrated
users, the snowflake for new ones), so a DM lands on exactly the same ledger as
their web session. A member who has never logged in on the web resolves to a
fresh key and starts empty.

## Security & secrets

- **Trust boundary** is the shared `DISCORD_BRIDGE_SECRET` (Bearer header). The
  bridge has no MilesVault session; the Worker rejects any request without the
  secret. Set it on the Worker (`wrangler secret put DISCORD_BRIDGE_SECRET`, plus
  `--env staging`) and in the box's `.env` — same value both places.
- The **Discord bot token lives only on the bridge**, never in Cloudflare. The
  Worker holds only the shared secret. (Rotation tracked in the hygiene task.)
- DMs are exempt from the privileged **Message Content** intent, so the bot
  doesn't request it — it only needs `DIRECT_MESSAGES` + the bot added to our
  guild (members who share the guild can DM it).

## State

Each DM is a **stateless one-shot** (`ConciergeDO.answerText`) — the same headless
turn the other text channels use, with no cross-message history. Conversation
memory (per-snowflake sub-agent threads, like the WhatsApp messenger) is a
deliberate future step, not in v1.

## Ops

- Box: OCI Always Free, Oracle Linux (`opc`). Node 20 from the official tarball
  (`dnf` OOMs on the 1 GB micro shape — add swap, use the tarball). systemd unit
  `discord-dm-bridge` restarts on crash; `discord.js` auto-reconnects the Gateway.
- Logs: `journalctl -u discord-dm-bridge -f`. Healthy startup logs
  `[bridge] connected as <bot>#0000`.
- Staging vs prod is just the bridge's `MILESVAULT_DM_URL` (+ the matching
  secret): point at `staging.milesvault.com` to test, flip to `milesvault.com`
  for prod.

See `bridge/discord-dm/README.md` for the step-by-step setup.
