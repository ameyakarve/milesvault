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
export { RefreshMagnifyWorkflow } from "../src/workflows/refresh-magnify.ts"
// Think messenger state agent — instantiated as a FACET sub-agent (ctx.exports)
// by the chat-sdk to persist messenger thread/dedupe state. Must be exported
// under this exact name for subAgent() resolution. (WhatsApp messenger.)
export { ThinkMessengerStateAgent } from "@cloudflare/think/messengers"

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
