#!/usr/bin/env node
// Regenerate src/durable/agents/tools/concierge/award-charts/air-india-self.ts
// from the Air India self award-chart CSV.
//
// CSV columns: from,to,scope,economy_min,premium_min,business_min,first_min,distance_km
// (scope + distance_km are dropped — pricing is the O&D min-miles per cabin).
//
// Usage:  node scripts/gen-award-chart-ai.mjs path/to/ai-chart.csv
//   e.g.  curl -fsSL https://pastebin.com/raw/ZrK8AHVW -o /tmp/ai-chart.csv
//         node scripts/gen-award-chart-ai.mjs /tmp/ai-chart.csv

import fs from 'node:fs'
import path from 'node:path'

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/gen-award-chart-ai.mjs <chart.csv>')
  process.exit(1)
}

const lines = fs.readFileSync(src, 'utf8').trim().split(/\r?\n/)
lines.shift() // header

const routes = {}
for (const line of lines) {
  const [from, to, , e, p, b, f] = line.split(',')
  const r = {}
  if (e) r.e = Number(e)
  if (p) r.p = Number(p)
  if (b) r.b = Number(b)
  if (f) r.f = Number(f)
  routes[`${from.trim()}-${to.trim()}`] = r
}

const n = Object.keys(routes).length
const out = `// AUTO-GENERATED — do not edit by hand.
// Air India self award chart (awards on AI own metal). ${n} directional O&D rows.
// Source: published Air India / Maharaja Club award chart.
// Columns collapsed to: e=economy, p=premium economy, b=business, f=first (min miles).
// Regenerate: scripts/gen-award-chart-ai.mjs

import type { OdTableChart } from "./types"

export const airIndiaSelf: OdTableChart = {
  method: "od-table",
  currency: "currency/maharaja-club-miles",
  carrier: "AI",
  routes: ${JSON.stringify(routes)},
}
`

const dest = path.resolve(
  'src/durable/agents/tools/concierge/award-charts/air-india-self.ts',
)
fs.writeFileSync(dest, out)
console.log(`wrote ${n} routes → ${dest}`)
