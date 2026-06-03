// Sync selected secrets from the shell environment (e.g. exported in
// ~/.zshrc) into the gitignored .dev.vars, so local-dev Worker bindings get
// the value without it being hardcoded/committed. zshrc stays the single
// source of truth; .dev.vars is a generated cache (wrangler can't reference
// env vars from .dev.vars — it reads the literal value only).
//
// Only the keys listed here are touched, and only when present in the
// environment — a missing env var leaves any existing .dev.vars line intact.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const KEYS = ['AERODATABOX_API_KEY']
const FILE = new URL('../.dev.vars', import.meta.url)

const raw = existsSync(FILE) ? readFileSync(FILE, 'utf8') : ''
const lines = raw.split('\n')
while (lines.length && lines[lines.length - 1] === '') lines.pop()

for (const key of KEYS) {
  const val = process.env[key]
  const i = lines.findIndex((l) => l.startsWith(`${key}=`))
  if (!val) {
    if (i < 0) console.warn(`[sync-dev-vars] ${key} not set in env and absent from .dev.vars`)
    continue
  }
  const line = `${key}=${val}`
  if (i >= 0) lines[i] = line
  else lines.push(line)
}

writeFileSync(FILE, `${lines.join('\n')}\n`)
