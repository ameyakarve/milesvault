#!/usr/bin/env node
// Offline identity migration (docs/design/discord-identity.md).
//
// Seeds the `user_keys` alias table so the ~30 existing email-keyed accounts
// stay reachable after the email→snowflake re-key: each legacy user gets a row
// (uid = Discord snowflake, storage_key = their old email). No Durable Object
// data moves. Runs OUT-OF-BAND via `wrangler d1 execute` (Cloudflare creds, not
// the app's owner gate) — which is why it works before anyone logs in, and
// sidesteps the bootstrap deadlock (the owner gate needs the owner already
// seeded). New users are NOT seeded here; they get storage_key = uid on first
// login via resolveStorageKey().
//
// ── Two modes ──────────────────────────────────────────────────────────────
//
// 1) Roster (correlate emails → snowflakes). Lists every guild member so you
//    can match handles to the emails your 30 accounts used. Needs a bot in the
//    guild with the GUILD_MEMBERS privileged intent:
//
//      DISCORD_BOT_TOKEN=xxx DISCORD_GUILD_ID=123 \
//      [DISCORD_MEMBER_ROLE_ID=456] node scripts/migrate-identity.mjs roster
//
//    → TSV: uid <tab> username <tab> hasRole   (one per member)
//
// 2) Seed (emit SQL). Reads a CSV of `email,uid` (one per line; a header row is
//    ignored) and prints INSERT SQL to stdout. Review it, then apply:
//
//      node scripts/migrate-identity.mjs seed map.csv > seed.sql
//      npx wrangler d1 execute milesvault --remote --file seed.sql
//      # (staging + prod share one D1, so a single apply covers both)

import { readFileSync } from 'node:fs'

const mode = process.argv[2]

const isSnowflake = (s) => /^[0-9]{15,21}$/.test(s)
const isEmail = (s) => /^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(s)
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'"

async function roster() {
  const token = process.env.DISCORD_BOT_TOKEN
  const guild = process.env.DISCORD_GUILD_ID
  const roleId = process.env.DISCORD_MEMBER_ROLE_ID || null
  if (!token || !guild) {
    console.error('roster: set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID (bot must be in the guild with the GUILD_MEMBERS intent)')
    process.exit(1)
  }
  let after = '0'
  let total = 0
  for (;;) {
    const url = `https://discord.com/api/v10/guilds/${guild}/members?limit=1000&after=${after}`
    const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } })
    if (!res.ok) {
      console.error(`roster: Discord ${res.status} — ${(await res.text()).slice(0, 300)}`)
      process.exit(1)
    }
    const members = await res.json()
    if (!Array.isArray(members) || members.length === 0) break
    for (const m of members) {
      const uid = m?.user?.id
      if (!uid) continue
      const username = m?.user?.username ?? ''
      const hasRole = roleId ? (Array.isArray(m.roles) && m.roles.includes(roleId)) : ''
      process.stdout.write(`${uid}\t${username}\t${hasRole}\n`)
      total++
      after = uid
    }
    if (members.length < 1000) break
  }
  console.error(`roster: ${total} members${roleId ? ' (hasRole flagged)' : ''}`)
}

function seed(file) {
  if (!file) {
    console.error('seed: usage — node scripts/migrate-identity.mjs seed <map.csv>')
    process.exit(1)
  }
  const rows = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(',').map((c) => c.trim()))

  const out = []
  const seen = new Set()
  let line = 0
  for (const cols of rows) {
    line++
    if (cols.length < 2) continue
    let [a, b] = cols
    // Accept either column order; skip an obvious header.
    let email = isEmail(a) ? a : isEmail(b) ? b : null
    let uid = isSnowflake(a) ? a : isSnowflake(b) ? b : null
    if (!email || !uid) {
      console.error(`-- skip line ${line}: need an email and a snowflake, got ${JSON.stringify(cols)}`)
      continue
    }
    if (seen.has(uid)) {
      console.error(`-- skip line ${line}: duplicate uid ${uid}`)
      continue
    }
    seen.add(uid)
    // storage_key = the legacy email, so the existing LedgerDO is reachable.
    const ts = Date.now()
    out.push(
      `INSERT OR IGNORE INTO user_keys (uid, storage_key, email, created_at) VALUES (${sqlStr(uid)}, ${sqlStr(email)}, ${sqlStr(email)}, ${ts});`,
    )
  }

  process.stdout.write(
    'CREATE TABLE IF NOT EXISTS user_keys (\n' +
      '  uid         TEXT PRIMARY KEY,\n' +
      '  storage_key TEXT NOT NULL,\n' +
      '  email       TEXT,\n' +
      '  created_at  INTEGER NOT NULL\n' +
      ');\n',
  )
  for (const stmt of out) process.stdout.write(stmt + '\n')
  console.error(`seed: ${out.length} user_keys row(s) emitted`)
}

if (mode === 'roster') await roster()
else if (mode === 'seed') seed(process.argv[3])
else {
  console.error('usage: node scripts/migrate-identity.mjs <roster | seed <map.csv>>')
  process.exit(1)
}
