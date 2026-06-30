// Discord DM → MilesVault concierge bridge (event forwarder).
//
// WHY THIS EXISTS: Discord delivers direct-message text ONLY over the Gateway
// WebSocket — there is no HTTP/webhook path for MESSAGE_CREATE (verified against
// the official docs). Cloudflare can't hold a persistent outbound socket (DO
// outbound WS can't hibernate and evicts ~15min; Containers are ephemeral;
// Workers have no persistent connections). So this dumb, always-on holder runs
// on a tiny box (OCI Always Free): it keeps the Gateway socket open and FORWARDS
// each inbound DM to the Worker as a Discord "forwarded Gateway event".
//
// It holds NO business logic and NO state. The Worker runs the real Think
// messenger: the @chat-adapter/discord adapter parses the forwarded event, maps
// the snowflake to the user's concierge sub-agent (their own persistent thread),
// runs the turn, and SENDS the reply itself over the Discord REST API. So the
// bot token now lives on the WORKER (for REST sends); this box holds only the
// token needed to open the Gateway and the shared secret to authenticate the
// forward. Outbound-only: no inbound ports to open on the box.

import { Client, GatewayIntentBits, Partials, Events } from 'discord.js'

const {
  DISCORD_BOT_TOKEN,
  MILESVAULT_WEBHOOK_URL, // e.g. https://milesvault.com/api/discord/webhook
  DISCORD_BRIDGE_SECRET,
} = process.env

for (const [k, v] of Object.entries({ DISCORD_BOT_TOKEN, MILESVAULT_WEBHOOK_URL, DISCORD_BRIDGE_SECRET })) {
  if (!v) {
    console.error(`[bridge] missing required env: ${k}`)
    process.exit(1)
  }
}

// Forward one inbound DM to the Worker as a DiscordForwardedEvent (the shape
// @chat-adapter/discord's handleForwardedGatewayEvent expects). Authenticated by
// the shared secret — Discord does not sign Gateway events, so the Worker's edge
// (inject-do) trusts this bearer. Fire-and-forget: the Worker replies via REST.
async function forward(message) {
  const event = {
    type: 'GATEWAY_MESSAGE_CREATE',
    timestamp: Date.now(),
    data: {
      id: message.id,
      content: message.content ?? '',
      channel_id: message.channelId,
      guild_id: message.guildId ?? null,
      channel_type: message.channel?.type,
      author: {
        id: message.author.id,
        username: message.author.username,
        global_name: message.author.globalName ?? undefined,
        bot: Boolean(message.author.bot),
      },
      attachments: [],
    },
  }
  const res = await fetch(MILESVAULT_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${DISCORD_BRIDGE_SECRET}`,
    },
    body: JSON.stringify(event),
  })
  if (!res.ok) throw new Error(`worker ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

// DMs do NOT require the privileged MessageContent intent (they're exempt), but
// DM channels arrive uncached, so the Channel/Message partials are required to
// receive them.
const client = new Client({
  intents: [GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel, Partials.Message],
})

client.once(Events.ClientReady, (c) => {
  console.log(`[bridge] connected as ${c.user.tag}`)
})

client.on(Events.MessageCreate, async (message) => {
  try {
    // Only forward inbound DMs from real users.
    if (message.author?.bot) return
    if (message.guildId) return // guild message, not a DM
    if (!(message.content ?? '').trim()) return // attachment-only / empty
    // Show a typing indicator while the Worker thinks + replies (best-effort).
    await message.channel.sendTyping().catch(() => {})
    await forward(message)
  } catch (err) {
    console.error('[bridge] forward failed', { user: message.author?.id, err: String(err) })
    await message.channel
      .send('Something went wrong on my end — please try again in a moment.')
      .catch(() => {})
  }
})

client.on(Events.Error, (err) => console.error('[bridge] client error', String(err)))
client.on(Events.ShardDisconnect, (e, id) =>
  console.warn(`[bridge] shard ${id} disconnected (${e?.code}) — discord.js will reconnect`),
)

client.login(DISCORD_BOT_TOKEN)
