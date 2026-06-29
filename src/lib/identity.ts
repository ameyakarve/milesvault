// User identity & the email→snowflake re-key (docs/design/discord-identity.md).
//
// The PRIMARY identity is the Discord snowflake (`uid`) — immutable, always
// present (`identify` scope), never reassigned. Discord's `email` is `?string`
// (nullable: phone signups, scope declined) so we NEVER key on it.
//
// Per-user Durable Objects (LEDGER_DO, CHAT_DO, CONCIERGE_DO) are addressed by a
// `storage_key`, resolved from the uid via `user_keys`:
//   - new users         → storage_key = uid (the snowflake)
//   - legacy (the ~30)  → storage_key = their old email, pre-seeded offline by
//                         the migration so their existing LedgerDO is reachable.
// No Durable Object data is ever moved; the table is a one-row alias.

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
  await db
    .prepare('INSERT OR IGNORE INTO user_keys (uid, storage_key, email, created_at) VALUES (?, ?, ?, ?)')
    .bind(uid, uid, email ?? null, Date.now())
    .run()
  const after = await db
    .prepare('SELECT storage_key FROM user_keys WHERE uid = ?')
    .bind(uid)
    .first<{ storage_key: string }>()
  return after?.storage_key ?? uid
}
