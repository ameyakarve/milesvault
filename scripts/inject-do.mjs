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

// Append: durable object export, auth-aware wrapper that routes /api/agents/*
// straight to the LedgerDO (preserving WebSocket upgrades that Next.js can't
// proxy through its fetch route handlers).
const wrapper = `
${marker}
import { getToken as __authGetToken } from "next-auth/jwt"
export { LedgerDO } from "../src/durable/ledger-do.ts"
export { ChatDO } from "../src/durable/chat-do.ts"

const __SESSION_COOKIE = "authjs.session-token"

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname === "/api/agents" || url.pathname.startsWith("/api/agents/")) {
      const email = await __resolveEmail(request, env)
      if (!email) return new Response("unauthorized", { status: 401 })
      const ns = env.CHAT_DO
      if (!ns) return new Response("CHAT_DO binding missing", { status: 500 })
      const id = ns.idFromName(email)
      const stub = ns.get(id)
      await stub.setName(email)
      return stub.fetch(request)
    }
    return __openNextHandler.fetch(request, env, ctx)
  },
}
`

await writeFile(workerPath, transformed + wrapper)
console.log('[inject-do] wrapped worker fetch at', workerPath)
