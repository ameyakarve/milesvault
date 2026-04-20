import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const workerPath = path.resolve('.open-next/worker.js')
const marker = '// MILESVAULT_AGENTS_INJECTED'

const current = await readFile(workerPath, 'utf8')
if (current.includes(marker)) {
  console.log('[inject-do] already injected, skipping')
  process.exit(0)
}

const defaultExportNeedle = 'export default {'
if (!current.includes(defaultExportNeedle)) {
  throw new Error('[inject-do] could not find `export default {` in worker.js')
}

const rewritten = current.replace(defaultExportNeedle, 'const __nextHandler = {')

const appended = `${rewritten}
${marker}
export { LedgerDO } from "../src/durable/ledger-do.ts"
export { ChatAgent } from "../src/durable/chat-agent.ts"
export { ThinkAgent } from "../src/durable/think-agent.ts"
import { fetchWithAgents as __fetchWithAgents } from "../src/durable/worker-intercept.ts"
export default {
  fetch(request, env, ctx) {
    return __fetchWithAgents(request, env, ctx, __nextHandler)
  },
}
`

await writeFile(workerPath, appended)
console.log('[inject-do] wrapped default fetch and appended DO exports in', workerPath)
