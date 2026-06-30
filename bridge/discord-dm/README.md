# Discord DM bridge

A ~40-line always-on holder for the Discord Gateway socket. Discord delivers DM
text **only** over the Gateway (no HTTP/webhook path for messages), and
Cloudflare can't keep a persistent outbound socket open, so this runs on a tiny
always-on box (OCI Always Free) instead.

It holds no logic and no state: on each inbound DM it forwards a Discord
"forwarded Gateway event" to the Worker (`/api/discord/webhook`). The Worker runs
the real Think messenger — the `@chat-adapter/discord` adapter parses the event,
maps the snowflake to the user's concierge sub-agent (their own persistent
thread), runs the turn, and **sends the reply itself over the Discord REST API**.
So the bot token now lives on the **Worker** (REST sends); this box keeps only the
token to open the Gateway and the shared secret to authenticate the forward.

```
Discord DM ──(Gateway WS)──▶ bridge ──(HTTPS POST, Bearer secret)──▶ Worker /api/discord/webhook
                                                          └─ @chat-adapter/discord parses the event
                                                          └─ resolveStorageKey(snowflake) → sub-agent
                                                          └─ conciergeEnabled gate + concierge turn
                                                          └─ adapter sends reply via Discord REST
Discord DM ◀──(REST createMessage)── Worker
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
idles ~100 MB. The default Oracle Linux image logs in as `opc`; an Ubuntu image
as `ubuntu` — adjust the commands below.

Networking gotchas when creating the instance:
- **Capacity type**: *On-demand* (the Always-Free-eligible one; not Preemptible).
- **Public IP**: the "Assign public IPv4" toggle is greyed until a **public
  subnet** exists — pick **Create new public subnet** (a private/unset subnet
  can't take a public IP, and the flag is immutable after creation). The public
  IP is only needed to SSH in for setup; the bridge itself is outbound-only.
- Ignore the **$X/month** cost estimate — it "does not reflect tier pricing".
  As long as the shape shows **Always Free Eligible**, the bill is $0.
- If you forgot the public IP at create-time and the subnet is public, add one
  later: Instance → Attached VNICs → the VNIC → IPv4 Addresses → Edit the private
  IP → Public IP Type = *Ephemeral*.

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

Deploy to **`/opt`**, not `/home`: on SELinux-enforcing Oracle Linux a systemd
service can't read its `EnvironmentFile`/`WorkingDirectory` under `/home`
(fails with "Permission denied").

```sh
# From your laptop, copy the folder up (use opc@ or ubuntu@ per the image):
scp -i ~/.ssh/<key> -r bridge/discord-dm opc@<PUBLIC_IP>:~/discord-dm

# On the box — install deps, then relocate to /opt and relabel for SELinux:
cd ~/discord-dm && npm install --omit=dev
cp .env.example .env && nano .env        # fill in the three values (below)
sudo mkdir -p /opt/discord-dm
sudo cp -r ~/discord-dm/. /opt/discord-dm/
sudo chown -R opc:opc /opt/discord-dm
sudo restorecon -Rv /opt/discord-dm 2>/dev/null || true   # SELinux contexts

# Run under systemd (unit uses /opt + user `opc`; edit it for `ubuntu`):
sudo cp /opt/discord-dm/discord-dm-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now discord-dm-bridge
journalctl -u discord-dm-bridge -f       # expect "[bridge] connected as <bot>#0000"
```

To update later: `scp` the changed file, `sudo cp` it into `/opt/discord-dm/`,
`sudo systemctl restart discord-dm-bridge`.

No inbound ports — the bridge only makes outbound connections (Discord + the
Worker). Leave the OCI security list locked down.

## The shared secret

Generate once, set it in **both** places:

```sh
openssl rand -hex 32   # use the same value in both commands below
```

- Worker: `wrangler secret put DISCORD_BRIDGE_SECRET` (prod, top-level config)
  and `wrangler secret put DISCORD_BRIDGE_SECRET --env staging`.
- Bridge: `DISCORD_BRIDGE_SECRET=` in `.env`.

## Worker secrets (the messenger lives on the Worker now)

The concierge turn + REST reply run on the Worker, so set these prod secrets
(the bot token MOVES here from the bridge; the bridge still needs its own copy to
open the Gateway):

- `wrangler secret put DISCORD_BOT_TOKEN` — Dev Portal → Bot → Token.
- `wrangler secret put DISCORD_PUBLIC_KEY` — Dev Portal → General Information.
- `wrangler secret put DISCORD_APPLICATION_ID` — Dev Portal → General Information.

Until all three (plus `D1`) are set, `getMessengers()` omits Discord and the
`/api/discord/webhook` route is inert — safe to deploy ahead of the cutover.

## Verify

1. `journalctl -u discord-dm-bridge -n 20 --no-pager` → expect
   `[bridge] connected as <bot>#0000`.
2. Smoke-test the webhook gate (no Discord needed): a POST with a bad/missing
   bearer returns `403`; with the right bearer it forwards to the host DO.
3. DM the bot from a Discord account → reply within a few seconds (a "typing…"
   indicator shows while the concierge turn runs).

## Promote to production (coordinated cutover)

Forwarding to `/api/discord/webhook` and the old `/api/discord/dm` removal land
together, so flip the bridge and the Worker in the same window:

1. Set the three Worker secrets above (prod).
2. Deploy prod (manual `workflow_dispatch` "Deploy production").
3. On the box: set `MILESVAULT_WEBHOOK_URL=https://milesvault.com/api/discord/webhook`
   in `.env`, then `sudo systemctl restart discord-dm-bridge`.

There is one bot / one bridge, so this *moves* it from staging to prod (it
doesn't run both). On prod the `concierge_enabled` flag gates who gets answers.

## Troubleshooting

- **SSH `Connection timed out during banner exchange`** — the box is wedged
  (e.g. a crash-looping service thrashing 1 GB RAM). Force-reboot from the OCI
  console; right after boot SSH in and `sudo systemctl stop discord-dm-bridge`
  before it thrashes again, then fix the cause.
- **SSH `Connection refused` right after a reboot** — sshd isn't up yet; wait
  ~60–90 s and retry.
- **systemd `Failed to load environment files: Permission denied`** — SELinux
  blocking `/home`. Deploy under `/opt` and `restorecon -R` it (above).
- **`dnf` gets `Killed`** — OOM on the 1 GB shape; use the Node tarball, not the
  package manager (above).
- **Bot connects but a DM produces no log line at all** — the message isn't
  reaching the bot: confirm it shares a guild with you and `DIRECT_MESSAGES`
  intent is set. Temporarily add a `console.log` at the top of the
  `MessageCreate` handler to confirm the event fires.
- **Links render as raw `[label](/path)`** — the bridge's `formatDiscordLinks`
  rewrites these; make sure `/opt`'s `index.mjs` is the current version and the
  service was restarted.
