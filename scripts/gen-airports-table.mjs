#!/usr/bin/env node
// Generate the bundled airports table for the award engine from the
// OurAirports dataset (has iso_country, unlike OpenFlights).
//
// Usage:
//   curl -fsSL https://davidmegginson.github.io/ourairports-data/airports.csv -o /tmp/ourairports.csv
//   node scripts/gen-airports-table.mjs /tmp/ourairports.csv
//
// Output: src/durable/agents/tools/concierge/award-engine/airports.ts
//   export const AIRPORTS: Record<string, [number, number, string]>
//   keyed by IATA → [lat, lng, isoCountryCode]. Seeded into the ConciergeDO
//   SQLite on migrate(); the engine resolves legs against that table.

import fs from 'node:fs'
import path from 'node:path'

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/gen-airports-table.mjs <ourairports.csv>')
  process.exit(1)
}

// Minimal RFC-4180-ish line splitter (handles quoted fields w/ commas).
function splitCsv(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/)
const header = splitCsv(lines[0])
const iLat = header.indexOf('latitude_deg')
const iLng = header.indexOf('longitude_deg')
const iCc = header.indexOf('iso_country')
const iIata = header.indexOf('iata_code')

const airports = {}
for (let i = 1; i < lines.length; i++) {
  if (!lines[i]) continue
  const f = splitCsv(lines[i])
  const iata = (f[iIata] || '').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(iata)) continue
  const lat = Number(f[iLat])
  const lng = Number(f[iLng])
  const cc = (f[iCc] || '').trim().toUpperCase()
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !/^[A-Z]{2}$/.test(cc)) continue
  // First-wins; OurAirports is largely deduped on iata for scheduled service.
  if (!airports[iata]) airports[iata] = [Math.round(lat * 1e4) / 1e4, Math.round(lng * 1e4) / 1e4, cc]
}

const keys = Object.keys(airports).sort()
const rows = keys.map((k) => `${JSON.stringify(k)}:[${airports[k][0]},${airports[k][1]},${JSON.stringify(airports[k][2])}]`)
const out = `// AUTO-GENERATED — do not edit by hand. ${keys.length} airports.
// Source: OurAirports (davidmegginson.github.io/ourairports-data/airports.csv).
// IATA → [lat, lng, isoCountryCode]. Regenerate: scripts/gen-airports-table.mjs

export const AIRPORTS: Record<string, [number, number, string]> = {
${rows.join(',\n')}
}
`

const dest = path.resolve('src/durable/agents/tools/concierge/award-engine/airports.ts')
fs.writeFileSync(dest, out)
console.log(`wrote ${keys.length} airports → ${dest} (${(out.length / 1024).toFixed(0)} KB)`)
