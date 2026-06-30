# Backlog

Deferred items. Each one has a "promote when" trigger so we don't build too
early.

## Client-side SQLite mirror for AI queries

**Status**: deferred. Current plan: `queryLedger` hits server only; client scans
the uncommitted buffer as an overlay.

**Idea**: mirror the server-side ledger SQLite schema into the browser via
`@sqlite.org/sqlite-wasm` + OPFS (Web Worker), with a sync driver that
fetches deltas since a server cursor and applies them. Uncommitted buffer stays
as a client-side overlay; the mirror is read-through.

**Why defer**:
- Today's queries are low-frequency (one or two per AI turn).
- Server SQLite + network is fast enough for personal-finance-scale ledgers.
- Sync adds a whole class of bugs (divergence, conflict, migrations) we don't
  need yet.

**Promote when any of**:
- AI turns routinely issue 5+ `queryLedger` calls and network latency shows up
  in telemetry.
- Offline reads become a product requirement.
- User workflows produce hundreds of uncommitted txns at a time (batch CSV
  import), making client-side indexed queries over the diff valuable.

**Sketch of the work**:
1. Schema parity: port the server ledger table + indexes into a client migration
   runner.
2. Sync driver: `GET /ledger/since?cursor=X` endpoint server-side; client
   applies deltas in a transaction, persists cursor.
3. Live updates: SSE or WS push of new deltas after the initial fill.
4. Query API: `queryLedger(params)` runs SQL against the local mirror, then
   overlays uncommitted parsed txns from the editor buffer.
5. Bundle cost audit: sqlite-wasm is ~1 MB gzipped; confirm acceptable before
   shipping.

**Intermediate step** (cheaper alternative if this gets hot before the full
mirror is justified): read-through cache in IndexedDB keyed by query-hash,
invalidated on any write. No schema to maintain, still kills repeat-query
latency.
