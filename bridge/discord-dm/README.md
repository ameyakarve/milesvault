# Discord DM bridge

A ~40-line always-on holder for the Discord Gateway socket. Discord delivers DM
text **only** over the Gateway (no HTTP/webhook path for messages), and
Cloudflare can't keep a persistent outbound socket open, so this runs on a tiny
always-on box (OCI Always Free) instead.

It holds no logic and no state: on each inbound DM it `POST`s `{snowflake, text}`
to the Worker (`/api/discord/dm`), then sends the reply back to the user. The bot
token lives only here; the Worker holds only the shared secret. The concierge
turn, identity resolution, and gating all happen in the Worker.

```
Discord DM ──(Gateway WS)──▶ bridge ──(HTTPS POST)──▶ Worker /api/discord/dm
                                                          └─ resolveStorageKey(snowflake)
                                                          └─ conciergeEnabled gate
                                                          └─ ConciergeDO.answerText()
bridge ◀──(reply text)──────────────────────────────────┘
Discord DM ◀──(channel.send)── bridge
```

## One-time Discord setup

On the **existing** MilesVault app in the [Developer Portal](https://discord.com/developers/applications)
(the one behind `AUTH_DISCORD_ID`):

1. **Bot** tab → *Reset Token* → copy → this is `DISCORD_BOT_TOKEN`.
2. Leave **Message Content** intent **off** — DMs are exempt from it.
3. **OAuth2 → URL Generator** → scope `bot` (no permissions needed) → open the
   generated URL → add the bot to our server. Members who share the guild can
   then DM it.

## Provision the OCI box

Always Free shape `VM.Standard.E2.1.Micro` (1 GB RAM) is plenty — the process
idles ~100 MB. Use a **public subnet** + **assign a public IPv4** (needed only to
SSH in for setup; the bridge itself is outbound-only). The default Oracle Linux
image logs in as `opc`; an Ubuntu image as `ubuntu` — adjust the commands below.

```sh
# 1 GB RAM is tight for installs — add swap first:
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile \
  && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Node 20 via the official tarball — works on any distro, ~no memory
# (dnf/apt can OOM on the 1 GB micro shape):
cd /tmp
curl -fsSLO https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz
sudo tar -xJf node-*-linux-x64.tar.xz -C /usr/local --strip-components=1
node -v   # expect v20.x
```

## Deploy the bridge

```sh
# From your laptop, copy this folder up (use opc@ or ubuntu@ per the image):
scp -i ~/.ssh/<key> -r bridge/discord-dm opc@<PUBLIC_IP>:~/discord-dm

# On the box:
cd ~/discord-dm
npm install --omit=dev
cp .env.example .env && nano .env   # fill in the three values (below)

# Run under systemd (unit defaults to user `opc`; edit it for `ubuntu`):
sudo cp discord-dm-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now discord-dm-bridge
journalctl -u discord-dm-bridge -f   # expect "[bridge] connected as <bot>#0000"
```

No inbound ports — the bridge only makes outbound connections (Discord + the
Worker). Leave the OCI security list locked down.

## The shared secret

Generate once, set it in **both** places:

```sh
openssl rand -hex 32   # use the same value in both commands below
```

- Worker: `wrangler secret put DISCORD_BRIDGE_SECRET` (prod) and
  `wrangler secret put DISCORD_BRIDGE_SECRET --env staging`.
- Bridge: `DISCORD_BRIDGE_SECRET=` in `.env`.

Point `MILESVAULT_DM_URL` at staging first to test, then flip to prod.
