#!/usr/bin/env node
// Parallel eval runner — N test accounts as serial Durable-Object lanes.
//
// Shards a promptfoo config's inline `tests` into N contiguous ranges and runs
// one `promptfoo eval` process per lane, each pinned to its own test account via
// MV_TEST_ACCOUNT (-> mv-test-account cookie -> test+k@milesvault.test -> its own
// per-email DOs). A Durable Object is single-threaded, so each account runs its
// shard serially; the N accounts run in parallel. None of the evals mutate the
// ledger (drafts are captured), so the accounts are interchangeable lanes.
//
// Usage:
//   export TEST_USER_TOKEN=$(grep '^TEST_USER_TOKEN=' .dev.vars | cut -d= -f2-)
//   node evals/run-parallel.mjs evals/concierge-bench.yaml 4
//
// N is bounded by Workers AI throughput, not the ledger — keep it ~4–6 to avoid
// gemma 429s.

import { spawn } from 'node:child_process'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'

const [configPath, nArg] = process.argv.slice(2)
if (!configPath) {
  console.error('usage: node evals/run-parallel.mjs <config.yaml> [N=4]')
  process.exit(1)
}
const N = Math.max(1, parseInt(nArg ?? '4', 10))
if (!process.env.TEST_USER_TOKEN) {
  console.error('TEST_USER_TOKEN must be set (the test-user cookie secret; see .dev.vars)')
  process.exit(1)
}

const cfg = parse(readFileSync(configPath, 'utf8'))
const M = Array.isArray(cfg.tests) ? cfg.tests.length : 0
if (!M) {
  console.error(`no inline \`tests\` array found in ${configPath}`)
  process.exit(1)
}
const lanes = Math.min(N, M)
const chunk = Math.ceil(M / lanes)
const tmp = mkdtempSync(join(tmpdir(), 'mv-eval-'))

console.log(`▶ ${M} cases · ${lanes} accounts · ~${chunk}/account — ${configPath}`)

function runLane(k) {
  const start = k * chunk
  const end = Math.min(start + chunk, M)
  if (start >= M) return Promise.resolve({ k, pass: 0, fail: 0, code: 0, empty: true })
  const out = join(tmp, `lane-${k}.json`)
  return new Promise((resolve) => {
    const env = { ...process.env, MV_TEST_ACCOUNT: String(k) }
    const args = [
      'promptfoo', 'eval', '-c', configPath,
      '--no-cache', '-j', '1',
      '--filter-range', `${start}:${end}`,
      '-o', out,
    ]
    const p = spawn('npx', args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const cap = (d) => { tail = (tail + d.toString()).slice(-6000) }
    p.stdout.on('data', cap)
    p.stderr.on('data', cap)
    p.on('close', (code) => {
      let pass = 0, fail = 0
      try {
        const j = JSON.parse(readFileSync(out, 'utf8'))
        const rows = j?.results?.results ?? j?.results ?? []
        for (const r of rows) (r.success ?? r.pass) ? pass++ : fail++
        if (!rows.length && j?.results?.stats) {
          pass = j.results.stats.successes ?? 0
          fail = j.results.stats.failures ?? 0
        }
      } catch { /* parse failed — show tail below */ }
      console.log(`  account ${k} [cases ${start}..${end - 1}] — ${pass} pass / ${fail} fail (exit ${code})`)
      if (code !== 0 && pass === 0 && fail === 0) {
        console.log(tail.split('\n').slice(-10).map((l) => `    ${l}`).join('\n'))
      }
      resolve({ k, pass, fail, code })
    })
  })
}

const results = await Promise.all(Array.from({ length: lanes }, (_, k) => runLane(k)))
const pass = results.reduce((s, r) => s + r.pass, 0)
const fail = results.reduce((s, r) => s + r.fail, 0)
console.log(`\n═══ total: ${pass} pass / ${fail} fail across ${lanes} accounts ═══`)
console.log(`    per-account result JSON: ${tmp}/lane-*.json`)
process.exit(fail ? 1 : 0)
