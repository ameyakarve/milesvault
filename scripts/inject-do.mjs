import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const workerPath = path.resolve('.open-next/worker.js')
const marker = '// MILESVAULT_WORKER_WRAPPED'

const original = await readFile(workerPath, 'utf8')
if (original.includes(marker)) {
  console.log('[inject-do] already wrapped, skipping')
  process.exit(0)
}

// Rename the OpenNext default export so we can call into it as a fallback.
const transformed = original.replace(
  /export default \{/,
  'const __openNextHandler = {',
)
if (transformed === original) {
  throw new Error('[inject-do] could not find `export default {` in worker.js')
}

// Append: durable object exports + auth-aware wrapper. Requests under
// /api/agents/<product>/... route to that product's DO namespace
// (editor → CHAT_DO, concierge → CONCIERGE_DO, …), preserving WebSocket
// upgrades that Next.js can't proxy through its fetch route handlers. The
// instance-name on the namespace is the signed-in user's email — clients
// don't pick it (they set partysocket `basePath` which leaves the path flat),
// and we bind to the authenticated identity to prevent impersonation.
const wrapper = `
${marker}
import { getToken as __authGetToken } from "next-auth/jwt"
export { LedgerDO } from "../src/durable/ledger-do.ts"
export { ChatDO } from "../src/durable/chat-do.ts"
export { ConciergeDO } from "../src/durable/concierge-do.ts"
export { MembershipDO } from "../src/durable/membership-do.ts"
export { AirportsDO } from "../src/durable/airports/airports-do.ts"
export { UsageDO } from "../src/durable/usage-do.ts"
export { RefreshMagnifyWorkflow } from "../src/workflows/refresh-magnify.ts"
// Think messenger state agent — instantiated as a FACET sub-agent (ctx.exports)
// by the chat-sdk to persist messenger thread/dedupe state. Must be exported
// under this exact name for subAgent() resolution. (WhatsApp messenger.)
export { ThinkMessengerStateAgent } from "@cloudflare/think/messengers"
// Discord DM bridge helpers: snowflake → durable storage key, and the
// concierge kill-switch (same gate the in-app/WhatsApp turns use).
import { resolveStorageKey as __resolveStorageKey } from "../src/lib/identity.ts"
import { conciergeEnabled as __conciergeEnabled } from "../src/lib/flags.ts"

const __SESSION_COOKIE = "authjs.session-token"

// Product segment after /api/agents/ → env binding name. Add a row when a
// new product DO ships; this script and wrangler.jsonc bindings are the only
// touch-points.
const __AGENT_DO_BINDINGS = {
  editor: "CHAT_DO",
  concierge: "CONCIERGE_DO",
}

// Resolve the request's identity from the next-auth JWT: { key, uid }.
//   key = per-user Durable Object storage key (idFromName) — snowflake for new
//         users, legacy email for the migrated ~30 (docs/design/discord-identity.md)
//   uid = Discord snowflake (the primary identity; used for the owner gate)
async function __resolveAuth(request, env) {
  // e2e test identity (staging only — TEST_USER_TOKEN secret unset in prod).
  if (env.TEST_USER_TOKEN) {
    const cookie = request.headers.get("cookie") ?? ""
    const m = /(?:^|;\s*)mv-test-token=([^;]+)/.exec(cookie)
    if (m && decodeURIComponent(m[1]) === env.TEST_USER_TOKEN) {
      return { key: "test@milesvault.test", uid: null }
    }
  }
  try {
    const token = await __authGetToken({
      req: request,
      secret: env.AUTH_SECRET,
      secureCookie: false,
      cookieName: __SESSION_COOKIE,
    })
    return { key: token?.key ?? null, uid: token?.uid ?? null }
  } catch {
    return { key: null, uid: null }
  }
}

// Manual workflow trigger: POST /api/admin/workflows/<name>. Gated to the
// owner — their storage key is their email = ALLOWED_EMAILS[0] — so a stray
// request can't trigger an Artifact-write workflow.
const __ownerKey = (env) => ((env.ALLOWED_EMAILS ?? "").split(",")[0] ?? "").trim()
const __WORKFLOW_BINDINGS = {
  "refresh-magnify": "REFRESH_MAGNIFY",
}

export default {
  async scheduled(_event, env, ctx) {
    // The only cron we register today is the daily Magnify refresh — see
    // wrangler.jsonc \`triggers.crons\`. If we add a second cron the
    // dispatch will need to switch on \`_event.cron\` (the cron pattern).
    ctx.waitUntil(env.REFRESH_MAGNIFY.create())
    // Self-heal the membership poll: ensure the singleton's 60s alarm is alive
    // (a no-op if it never bootstrapped or is already running).
    if (env.MEMBERSHIP_DO) {
      const ns = env.MEMBERSHIP_DO
      ctx.waitUntil(ns.get(ns.idFromName("global")).poke().catch(() => {}))
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    // WhatsApp webhook (Think messenger on ConciergeDO). Unauthenticated — Meta
    // has no MilesVault session; the trust boundary is the X-Hub-Signature-256
    // HMAC, which the adapter verifies on POST. Must run BEFORE Next middleware.
    // Keep this path in sync with WHATSAPP_WEBHOOK_PATH in whatsapp.ts.
    if (url.pathname === "/api/whatsapp/webhook") {
      // GET: Meta's subscribe handshake. Think's handleRequest 405s non-POST, so
      // we answer it here (echo hub.challenge iff the verify token matches).
      if (request.method === "GET") {
        const mode = url.searchParams.get("hub.mode")
        const token = url.searchParams.get("hub.verify_token")
        const challenge = url.searchParams.get("hub.challenge")
        if (mode === "subscribe" && token && env.WHATSAPP_VERIFY_TOKEN && token === env.WHATSAPP_VERIFY_TOKEN) {
          return new Response(challenge ?? "", { status: 200 })
        }
        return new Response("forbidden", { status: 403 })
      }
      if (request.method === "POST") {
        // Route to the single WhatsApp host ConciergeDO; its getMessengers()
        // resolver maps each sender to their own concierge sub-agent.
        const ns = env.CONCIERGE_DO
        if (!ns) return new Response("CONCIERGE_DO binding missing", { status: 500 })
        const hostName = "__whatsapp_host__"
        const stub = ns.get(ns.idFromName(hostName))
        await stub.setName(hostName)
        return stub.fetch(request)
      }
      return new Response("Method not allowed", { status: 405 })
    }
    // Discord DM bridge. Discord has NO HTTP path for DM text (only the Gateway
    // delivers it), so a tiny always-on bridge (OCI box) holds the socket and
    // POSTs each inbound DM here. Unauthenticated by session — the bridge has no
    // MilesVault cookie; the trust boundary is the shared DISCORD_BRIDGE_SECRET.
    // The Discord snowflake IS the identity (no pairing): resolveStorageKey maps
    // it to the user's durable storage key, exactly as web login does. We return
    // the reply TEXT to the bridge, which sends it to Discord — the bot token
    // lives ONLY on the bridge, never in Cloudflare. The turn runs on the user's
    // own concierge sub-agent (a facet keyed by storage key), so DMs carry memory
    // across messages — same model as WhatsApp. (task #37)
    if (url.pathname === "/api/discord/dm" && request.method === "POST") {
      const secret = env.DISCORD_BRIDGE_SECRET
      if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
        return new Response("forbidden", { status: 403 })
      }
      let body
      try {
        body = await request.json()
      } catch {
        return new Response("bad json", { status: 400 })
      }
      const snowflake = String(body?.snowflake ?? "").trim()
      const text = String(body?.text ?? "").trim()
      if (!snowflake || !text) {
        return new Response("missing snowflake/text", { status: 400 })
      }
      if (!env.D1) return new Response("D1 binding missing", { status: 500 })
      const ns = env.CONCIERGE_DO
      if (!ns) return new Response("CONCIERGE_DO binding missing", { status: 500 })
      const key = await __resolveStorageKey(env.D1, snowflake)
      // Same fail-closed gate as every other concierge surface.
      if (!(await __conciergeEnabled(env, { email: key }))) {
        return Response.json({ text: "You don't have concierge access yet." })
      }
      // Run on the per-user concierge sub-agent (a facet keyed by storage key —
      // a separate persistent thread from the web chat, same ledger), so Discord
      // DMs have memory across messages, like WhatsApp. The facet is materialized
      // by answerForDiscord on the shared __discord_host__ instance.
      const hostName = "__discord_host__"
      const stub = ns.get(ns.idFromName(hostName))
      await stub.setName(hostName)
      const { text: reply } = await stub.answerForDiscord(key, text)
      return Response.json({ text: reply })
    }
    if (
      url.pathname.startsWith("/api/admin/workflows/") &&
      request.method === "POST"
    ) {
      const name = url.pathname.slice("/api/admin/workflows/".length)
      const bindingName = __WORKFLOW_BINDINGS[name]
      if (!bindingName) {
        return new Response("unknown workflow: " + name, { status: 404 })
      }
      const { key } = await __resolveAuth(request, env)
      const ownerKey = __ownerKey(env)
      if (!ownerKey || key !== ownerKey) {
        return new Response("forbidden", { status: 403 })
      }
      const wf = env[bindingName]
      if (!wf) return new Response(bindingName + " binding missing", { status: 500 })
      const instance = await wf.create()
      return Response.json({ id: instance.id, status: await instance.status() })
    }
    // ADMIN: GET /api/admin/dump-ledger?key=<storage_key>[&t=<RECOVERY_TOKEN>]
    // Dumps any user's ledger as beancount text (Content-Type text/plain). Used
    // for member data recovery / support — e.g. a member whose data sits under a
    // stale storage key (their old email) after a re-key to their uid; dump it so
    // they can re-add it, or so we can inspect. Read-only (LedgerDO.journal_get).
    //
    // Auth — EITHER is accepted:
    //   1) a valid OWNER session (open the URL in a browser while signed in as
    //      the owner — key === ALLOWED_EMAILS[0]); or
    //   2) the RECOVERY_TOKEN prod secret via the t= query param (curl/no cookie).
    // Runs BEFORE Next middleware; the matcher excludes /api/admin. Docs:
    // docs/ops/admin-endpoints.md.
    if (url.pathname === "/api/admin/dump-ledger" && request.method === "GET") {
      // getToken must read the prod secure-prefixed cookie over https; the
      // shared __resolveAuth hardcodes secureCookie:false (http/staging only).
      const isHttps = url.protocol === "https:"
      const cookieName = isHttps ? "__Secure-authjs.session-token" : __SESSION_COOKIE
      const token = await __authGetToken({
        req: request,
        secret: env.AUTH_SECRET,
        secureCookie: isHttps,
        cookieName,
        salt: cookieName,
      }).catch(() => null)
      const authKey = token?.key ?? null
      const ownerKey = __ownerKey(env)
      // Accept EITHER a valid owner session OR the RECOVERY_TOKEN prod secret
      // (via the t= query param) — the latter lets the operator fetch over curl
      // without session-cookie parsing.
      const tokenOk = !!env.RECOVERY_TOKEN && url.searchParams.get("t") === env.RECOVERY_TOKEN
      const ownerOk = !!ownerKey && authKey === ownerKey
      if (!tokenOk && !ownerOk) {
        return new Response("forbidden: resolved key=" + (authKey ?? "null"), { status: 403 })
      }
      const target = url.searchParams.get("key")
      if (!target) return new Response("missing ?key=<storage_key>", { status: 400 })
      const ns = env.LEDGER_DO
      if (!ns) return new Response("LEDGER_DO binding missing", { status: 500 })
      const { text } = await ns.get(ns.idFromName(target)).journal_get()
      return new Response(text ?? "", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    }
    if (url.pathname === "/api/agents" || url.pathname.startsWith("/api/agents/")) {
      // Path shape: /api/agents/<product>[/anything]. parts[2] selects the
      // product DO; everything after is opaque to the wrapper and forwarded
      // to the DO's fetch().
      const parts = url.pathname.split("/").filter(Boolean)
      const product = parts[2]
      const bindingName = product ? __AGENT_DO_BINDINGS[product] : undefined
      if (!bindingName) {
        return new Response(
          "unknown agent product: " + (product ?? "(none)") +
            ". Set useAgent({ basePath: 'api/agents/<product>' }) to one of: " +
            Object.keys(__AGENT_DO_BINDINGS).join(", "),
          { status: 404 },
        )
      }
      const ns = env[bindingName]
      if (!ns) {
        return new Response(bindingName + " binding missing", { status: 500 })
      }
      const { key } = await __resolveAuth(request, env)
      if (!key) return new Response("unauthorized", { status: 401 })
      // Optional per-item thread (Inbox chat): ?thread=<captureId> selects a
      // dedicated DO instance named "<key>::<id>". The key always comes
      // from the session, so a user can only ever reach their own threads.
      const thread = url.searchParams.get("thread")
      let name = key
      if (thread) {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(thread)) {
          return new Response("invalid thread id", { status: 400 })
        }
        name = key + "::" + thread
      }
      const id = ns.idFromName(name)
      const stub = ns.get(id)
      await stub.setName(name)
      return stub.fetch(request)
    }
    return __openNextHandler.fetch(request, env, ctx)
  },
}
`

await writeFile(workerPath, transformed + wrapper)
console.log('[inject-do] wrapped worker fetch at', workerPath)
