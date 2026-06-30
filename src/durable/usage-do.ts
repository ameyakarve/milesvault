import { DurableObject } from 'cloudflare:workers'
import { costMicros } from '@/lib/ai-cost'

// Per-user AI usage meter — keyed by storage_key, so the DO instance IS the
// user (idFromName(key), the same key every other per-user DO uses). Every
// model call's tokens + computed cost are appended here from the buildModel
// usage middleware (base-agent-do), across ALL surfaces (concierge, editor,
// messengers).
//
// MONITORING ONLY today — no budget, no enforcement (that's a later step). Note
// the env isolation this buys for free: the one D1 is shared across prod +
// staging, but DOs are per-Worker-script, so prod and staging usage never mix.
export type UsageEvent = { surface: string; model: string; inTok: number; outTok: number }

export class UsageDO extends DurableObject<Cloudflare.Env> {
  private readonly sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ai_usage (
         ts          INTEGER NOT NULL,
         surface     TEXT    NOT NULL,
         model       TEXT    NOT NULL,
         in_tok      INTEGER NOT NULL,
         out_tok     INTEGER NOT NULL,
         cost_micros INTEGER NOT NULL
       )`,
    )
    this.sql.exec(`CREATE INDEX IF NOT EXISTS ai_usage_ts ON ai_usage(ts)`)
  }

  // Append one generation's usage. Cost is computed HERE so it's the single
  // source (the middleware only forwards raw tokens).
  async recordUsage(e: UsageEvent): Promise<void> {
    this.sql.exec(
      `INSERT INTO ai_usage (ts, surface, model, in_tok, out_tok, cost_micros)
       VALUES (?, ?, ?, ?, ?, ?)`,
      Date.now(),
      e.surface,
      e.model,
      e.inTok,
      e.outTok,
      costMicros(e.model, e.inTok, e.outTok),
    )
  }

  // Spend since `sinceMs` (default: start of the current UTC month). Returns
  // USD plus token totals — the read side for monitoring (e.g. /api/usage).
  async spendUsd(sinceMs?: number): Promise<{ usd: number; inTok: number; outTok: number }> {
    const since = sinceMs ?? startOfMonthMs()
    const row = this.sql
      .exec<{ c: number; i: number; o: number }>(
        `SELECT COALESCE(SUM(cost_micros), 0) AS c,
                COALESCE(SUM(in_tok), 0)      AS i,
                COALESCE(SUM(out_tok), 0)     AS o
           FROM ai_usage WHERE ts >= ?`,
        since,
      )
      .toArray()[0]
    return { usd: (row?.c ?? 0) / 1_000_000, inTok: row?.i ?? 0, outTok: row?.o ?? 0 }
  }
}

function startOfMonthMs(): number {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}
