// Discord DM → MilesVault concierge bridge.
//
// WHY THIS EXISTS: Discord delivers direct-message text ONLY over the Gateway
// WebSocket — there is no HTTP/webhook path for MESSAGE_CREATE (verified against
// the official docs). Cloudflare can't hold a persistent outbound socket (DO
// outbound WS can't hibernate and evicts ~15min; Containers are ephemeral;
// Workers have no persistent connections). So this dumb, always-on holder runs
// on a tiny box (OCI Always Free): it keeps the Gateway socket open and, on each
// inbound DM, POSTs {snowflake, text} to the Worker, then sends back the reply.
//
// It holds NO business logic and NO state. The Worker does identity resolution
// (snowflake → storage key), the concierge turn, and gating. The bot token lives
// ONLY here; the Worker holds only the shared secret. Outbound-only: no inbound
// ports to open on the box.

import { Client, GatewayIntentBits, Partials, Events } from 'discord.js'

const {
  DISCORD_BOT_TOKEN,
  MILESVAULT_DM_URL, // e.g. https://milesvault.com/api/discord/dm
  DISCORD_BRIDGE_SECRET,
} = process.env

for (const [k, v] of Object.entries({ DISCORD_BOT_TOKEN, MILESVAULT_DM_URL, DISCORD_BRIDGE_SECRET })) {
  if (!v) {
    console.error(`[bridge] missing required env: ${k}`)
    process.exit(1)
  }
}

// Origin for absolutising the app-relative links the concierge emits (e.g.
// /points). Derived from the DM endpoint URL so staging/prod track automatically.
const DM_ORIGIN = new URL(MILESVAULT_DM_URL).origin

const DISCORD_MAX = 2000 // hard per-message character cap on Discord

// Discord renders masked links `[label](url)` literally in normal messages and
// won't resolve app-relative paths, so rewrite the concierge's links to bare,
// absolute, click-through URLs: `[label](/points?x)` -> `label: <origin/points?x>`
// (the <> keeps it clickable while suppressing the bulky embed card). Bare
// absolute URLs are left as-is. Generic text rewrite — no domain specifics.
function formatDiscordLinks(text, origin) {
  const abs = (raw) => {
    const u = raw.replace(/\\([&_*[\]()~`>])/g, '$1').trim()
    return u.startsWith('/') ? origin + u : u
  }
  return text
    .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, label, url) =>
      label.trim() ? `${label.trim()}: <${abs(url)}>` : `<${abs(url)}>`,
    )
    .replace(/<(\/[^>\s]+)>/g, (_m, url) => `<${abs(url)}>`)
}

// Split a reply into <=2000-char chunks on paragraph/line boundaries so a long
// answer arrives as a few clean messages instead of being rejected.
function chunk(text) {
  const out = []
  let rest = text
  while (rest.length > DISCORD_MAX) {
    let cut = rest.lastIndexOf('\n\n', DISCORD_MAX)
    if (cut < DISCORD_MAX * 0.5) cut = rest.lastIndexOf('\n', DISCORD_MAX)
    if (cut < DISCORD_MAX * 0.5) cut = rest.lastIndexOf(' ', DISCORD_MAX)
    if (cut <= 0) cut = DISCORD_MAX
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

// Ask the Worker for the concierge's reply to one DM.
async function askConcierge(snowflake, text) {
  const res = await fetch(MILESVAULT_DM_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${DISCORD_BRIDGE_SECRET}`,
    },
    body: JSON.stringify({ snowflake, text }),
  })
  if (!res.ok) throw new Error(`worker ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return String(data?.text ?? '').trim()
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
    // Only handle inbound DMs from real users.
    if (message.author?.bot) return
    if (message.guildId) return // guild message, not a DM
    const text = (message.content ?? '').trim()
    if (!text) return // attachment-only / empty — nothing to answer

    // Discord's typing indicator lasts only ~10s, but a concierge turn (gemma +
    // tool loop + codemode) can run much longer, so re-send it every 8s until the
    // reply lands — otherwise a slow turn looks dead. Cleared in `finally`.
    await message.channel.sendTyping().catch(() => {})
    const keepTyping = setInterval(() => {
      message.channel.sendTyping().catch(() => {})
    }, 8000)
    let reply
    try {
      reply = await askConcierge(message.author.id, text)
    } finally {
      clearInterval(keepTyping)
    }
    const parts = chunk(
      formatDiscordLinks(reply || 'Sorry — I could not work out an answer to that.', DM_ORIGIN),
    )
    for (const part of parts) await message.channel.send(part)
  } catch (err) {
    console.error('[bridge] turn failed', { user: message.author?.id, err: String(err) })
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
