import { DurableObject } from 'cloudflare:workers'
import { AIRPORTS_DATA } from './airports-data'

// Dedicated reference store for airports — a single shared instance
// (idFromName('global')) with an FTS5 index over iata / name / city / country,
// seeded once from the bundled dataset (src/durable/airports/airports-data.ts).
//
// Airports are STATIC REFERENCE DATA, not the loyalty graph, so they live here —
// not the KG — and any surface (the Explorer typeahead today, anything else
// later) queries this one store. DO SQLite supports the FTS5 module (the only
// virtual-table module Cloudflare allows), which is exactly what a typeahead
// over ~6k airports wants. No model, no external calls — pure reference lookup.

export type AirportHit = { iata: string; name: string; city: string | null }

export class AirportsDO extends DurableObject<Cloudflare.Env> {
  private readonly sql: SqlStorage
  private seeded = false

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    // FTS5 over all four columns; unicode61 tokeniser handles diacritics/case.
    this.sql.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ap USING fts5(iata, name, city, country, tokenize = 'unicode61')`,
    )
  }

  // Seed from the bundled dataset on first use (idempotent — guarded by row
  // count, so it runs exactly once for the lifetime of the instance's storage).
  // Values are INLINED (single quotes escaped), not bound — DO SQLite caps the
  // number of bound parameters per statement, so a multi-row bound INSERT fails;
  // inlining lets us batch large chunks (same approach as airports-store).
  private ensureSeeded(): void {
    if (this.seeded) return
    const n = (this.sql.exec(`SELECT COUNT(*) AS n FROM ap`).toArray()[0]?.n as number) ?? 0
    if (n === 0) {
      const lit = (s: string | null) => `'${(s ?? '').replace(/'/g, "''")}'`
      const CHUNK = 500
      for (let i = 0; i < AIRPORTS_DATA.length; i += CHUNK) {
        const values = AIRPORTS_DATA.slice(i, i + CHUNK)
          .map(([iata, name, city, country]) => `(${lit(iata)},${lit(name)},${lit(city)},${lit(country)})`)
          .join(',')
        this.sql.exec(`INSERT INTO ap (iata, name, city, country) VALUES ${values}`)
      }
    }
    this.seeded = true
  }

  // Typeahead search. Exact IATA (the natural key) is boosted to the top, then
  // a prefix match over name / city / iata ranked by bm25. Returns up to `limit`
  // { iata, name, city }. RPC for /api/concierge/airports.
  async search(q: string, limit = 8): Promise<AirportHit[]> {
    const query = q.trim()
    if (query.length < 2) return []
    this.ensureSeeded()

    const out: AirportHit[] = []
    const seen = new Set<string>()
    const push = (r: Record<string, unknown>) => {
      const iata = String(r.iata)
      if (seen.has(iata)) return
      seen.add(iata)
      out.push({ iata, name: String(r.name), city: r.city == null ? null : String(r.city) })
    }

    // Tokenise: keep alphanumerics, split on the rest. FTS5 query syntax is
    // sensitive to punctuation, so this also sanitises the user input.
    const terms = query
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    if (!terms.length) return []

    // 1. Exact IATA — the natural key — ranked first.
    if (/^[a-z]{3}$/.test(query)) {
      for (const r of this.sql
        .exec(`SELECT iata, name, city FROM ap WHERE ap MATCH ? LIMIT 4`, `iata:${terms[0]}`)
        .toArray())
        push(r)
    }

    // 2. Prefix match across name / city / iata, bm25-ranked.
    const match = terms.map((t) => `${t}*`).join(' ')
    for (const r of this.sql
      .exec(`SELECT iata, name, city FROM ap WHERE ap MATCH ? ORDER BY bm25(ap) LIMIT ?`, match, limit)
      .toArray())
      push(r)

    return out.slice(0, limit)
  }
}
