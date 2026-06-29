// User identity & the email→snowflake re-key (docs/design/discord-identity.md).
//
// The PRIMARY identity is the Discord snowflake (`uid`) — immutable, always
// present (`identify` scope), never reassigned. Discord's `email` is `?string`
// (nullable: phone signups, scope declined) so we NEVER key on it.
//
// Per-user Durable Objects (LEDGER_DO, CHAT_DO, CONCIERGE_DO) are addressed by a
// `storage_key`, resolved from the uid via `user_keys` and recorded on first
// login (stable thereafter, even if the user later changes their email):
//   - has an email → storage_key = email. Every pre-cutover user has one (logins
//                    without an email were rejected) and their ledger already
//                    lives under that email, so this AUTO-MIGRATES them — no
//                    offline seed, no email↔snowflake map.
//   - no email     → storage_key = uid (the snowflake). Such accounts are newly
//                    able to sign in and have no prior data, so they start fresh.

export const USER_KEYS_DDL = `CREATE TABLE IF NOT EXISTS user_keys (
  uid         TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  email       TEXT,
  created_at  INTEGER NOT NULL
)`

// Resolve (get-or-create) the durable storage key for a Discord snowflake.
// Legacy users were pre-seeded (storage_key = old email); a brand-new uid gets
// storage_key = uid. Race-safe via INSERT OR IGNORE on the uid primary key.
export async function resolveStorageKey(
  db: D1Database,
  uid: string,
  email?: string | null,
): Promise<string> {
  await db.prepare(USER_KEYS_DDL).run()
  const existing = await db
    .prepare('SELECT storage_key, email FROM user_keys WHERE uid = ?')
    .bind(uid)
    .first<{ storage_key: string; email: string | null }>()
  if (existing) {
    // Best-effort backfill: capture the email attribute the first time Discord
    // grants us the scope (no write on the steady-state login path).
    if (email && !existing.email) {
      await db
        .prepare('UPDATE user_keys SET email = ? WHERE uid = ? AND email IS NULL')
        .bind(email, uid)
        .run()
        .catch(() => {})
    }
    return existing.storage_key
  }
  // First login for this snowflake. Prefer the email as the storage key: every
  // EXISTING user has one (emailless logins were rejected before this cutover)
  // and their ledger lives under that email — so keying by it auto-preserves
  // their data with no offline migration. Emailless accounts (now newly able to
  // sign in) have no prior data, so they start fresh on the snowflake. The row
  // is recorded, so the key is stable even if the user later changes their email.
  const storageKey = email ?? uid
  await db
    .prepare('INSERT OR IGNORE INTO user_keys (uid, storage_key, email, created_at) VALUES (?, ?, ?, ?)')
    .bind(uid, storageKey, email ?? null, Date.now())
    .run()
  const after = await db
    .prepare('SELECT storage_key FROM user_keys WHERE uid = ?')
    .bind(uid)
    .first<{ storage_key: string }>()
  return after?.storage_key ?? storageKey
}
