import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const workerPath = path.resolve('.open-next/worker.js')
const marker = '// LEDGER_DO_EXPORT_INJECTED'

const current = await readFile(workerPath, 'utf8')
if (current.includes(marker)) {
  console.log('[inject-do] already injected, skipping')
  process.exit(0)
}

const injected =
  current +
  `\n${marker}\nexport { LedgerDO } from "../src/durable/ledger-do.ts"\n`

await writeFile(workerPath, injected)
console.log('[inject-do] appended LedgerDO export to', workerPath)
