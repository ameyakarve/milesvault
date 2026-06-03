import { AIRPORTS } from './award-engine/airports'
import type { AirportLookup, AirportRow } from './award-engine'

// Airports live in the ConciergeDO's own SQLite (the Think agent's local
// store). Seeded once from the bundled OurAirports table; the award engine
// resolves legs (great-circle distance + ISO country code) against it.

const TABLE = `CREATE TABLE IF NOT EXISTS airports (
  iata TEXT PRIMARY KEY,
  lat  REAL NOT NULL,
  lng  REAL NOT NULL,
  cc   TEXT NOT NULL
)`

// Create the table and seed it if empty. Values are inlined (no bound
// params) so we can batch large chunks — every field is machine-generated
// and shape-validated (iata /^[A-Z]{3}$/, cc /^[A-Z]{2}$/, lat/lng finite),
// so there is nothing to escape.
export function seedAirports(db: SqlStorage): void {
  db.exec(TABLE)
  const n = (db.exec('SELECT COUNT(*) AS n FROM airports').toArray()[0]?.n as number) ?? 0
  if (n > 0) return

  const entries = Object.entries(AIRPORTS)
  const CHUNK = 500
  for (let i = 0; i < entries.length; i += CHUNK) {
    const values = entries
      .slice(i, i + CHUNK)
      .map(([iata, [lat, lng, cc]]) => `('${iata}',${lat},${lng},'${cc}')`)
      .join(',')
    db.exec(`INSERT OR IGNORE INTO airports (iata, lat, lng, cc) VALUES ${values}`)
  }
}

// Synchronous IATA → [lat, lng, cc] lookup over the DO SQLite. Injected into
// the award engine in place of the reference's KV.
export function makeAirportLookup(db: SqlStorage): AirportLookup {
  return (iata: string): AirportRow | null => {
    const rows = db
      .exec('SELECT lat, lng, cc FROM airports WHERE iata = ?', iata.toUpperCase())
      .toArray()
    if (!rows.length) return null
    const r = rows[0]
    return [r.lat as number, r.lng as number, r.cc as string]
  }
}
