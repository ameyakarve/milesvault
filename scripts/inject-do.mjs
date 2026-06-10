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
export { RefreshMagnifyWorkflow } from "../src/workflows/refresh-magnify.ts"

const __SESSION_COOKIE = "authjs.session-token"

// Product segment after /api/agents/ → env binding name. Add a row when a
// new product DO ships; this script and wrangler.jsonc bindings are the only
// touch-points.
const __AGENT_DO_BINDINGS = {
  editor: "CHAT_DO",
  concierge: "CONCIERGE_DO",
}

async function __resolveEmail(request, env) {
  try {
    const token = await __authGetToken({
      req: request,
      secret: env.AUTH_SECRET,
      secureCookie: false,
      cookieName: __SESSION_COOKIE,
    })
    return token?.email ?? null
  } catch {
    return null
  }
}

// Manual workflow trigger: POST /api/admin/workflows/<name>. Gated to the
// admin email so a stray request can't trigger an Artifact-write workflow.
const __ADMIN_EMAIL = "ameya.karve@gmail.com"
const __WORKFLOW_BINDINGS = {
  "refresh-magnify": "REFRESH_MAGNIFY",
}

export default {
  async scheduled(_event, env, ctx) {
    // The only cron we register today is the daily Magnify refresh — see
    // wrangler.jsonc \`triggers.crons\`. If we add a second cron the
    // dispatch will need to switch on \`_event.cron\` (the cron pattern).
    ctx.waitUntil(env.REFRESH_MAGNIFY.create())
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (
      url.pathname.startsWith("/api/admin/workflows/") &&
      request.method === "POST"
    ) {
      const name = url.pathname.slice("/api/admin/workflows/".length)
      const bindingName = __WORKFLOW_BINDINGS[name]
      if (!bindingName) {
        return new Response("unknown workflow: " + name, { status: 404 })
      }
      const email = await __resolveEmail(request, env)
      if (email !== __ADMIN_EMAIL) {
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
      const email = await __resolveEmail(request, env)
      if (!email) return new Response("unauthorized", { status: 401 })
      // Optional per-item thread (Inbox chat): ?thread=<captureId> selects a
      // dedicated DO instance named "<email>::<id>". The email always comes
      // from the session, so a user can only ever reach their own threads.
      const thread = url.searchParams.get("thread")
      let name = email
      if (thread) {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(thread)) {
          return new Response("invalid thread id", { status: 400 })
        }
        name = email + "::" + thread
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
