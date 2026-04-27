import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const workerPath = path.resolve('.open-next/worker.js')
const marker = '// MILESVAULT_DO_INJECTED'

const current = await readFile(workerPath, 'utf8')
if (current.includes(marker)) {
  console.log('[inject-do] already injected, skipping')
  process.exit(0)
}

const appended = `${current}
${marker}
export { LedgerDO } from "../src/durable/ledger-do.ts"
`

await writeFile(workerPath, appended)
console.log('[inject-do] appended LedgerDO export to', workerPath)
