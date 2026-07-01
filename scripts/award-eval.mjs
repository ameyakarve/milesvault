// Run the award-pricing ENGINE directly against real airport data — no KG, no
// routing, no OWN_METAL edges, no ConciergeDO. Give it a programme + legs and it
// prints exactly what the engine resolves (the distances/country codes it
// computes) and what it prices. Use this for evals instead of hand-math.
//
// Usage:
//   node scripts/award-eval.mjs <programme|all> <ORIGIN-DEST[/CARRIER]> ...
//
// Examples:
//   node scripts/award-eval.mjs etihad-guest BOM-JED/SV JED-AUH/EY
//   node scripts/award-eval.mjs saudia RUH-BEY/SV
//   node scripts/award-eval.mjs all BOM-LHR
//
// A leg is ORIGIN-DEST, optionally /CARRIER (IATA). Omit the carrier to price
// with no operating carrier specified.

import { AIRPORTS } from '../src/durable/agents/tools/concierge/award-engine/airports.ts'
import {
  priceProgramme,
  priceItinerary,
  resolveLegs,
  resolveProgrammeId,
  PROGRAMMES,
} from '../src/durable/agents/tools/concierge/award-engine/index.js'

const lookup = (iata) => AIRPORTS[String(iata).toUpperCase()] ?? null

function usage() {
  console.error('usage: node scripts/award-eval.mjs <programme|all> <ORIGIN-DEST[/CARRIER]> ...')
  console.error('   e.g. node scripts/award-eval.mjs etihad-guest BOM-JED/SV JED-AUH/EY')
}

const args = process.argv.slice(2)
if (args.length < 2) {
  usage()
  process.exit(1)
}
const [progArg, ...legArgs] = args

const legs = legArgs.map((s) => {
  const [od, carrier] = s.split('/')
  const [origin, destination] = (od || '').split('-')
  if (!origin || !destination) {
    console.error(`bad leg "${s}" — expected ORIGIN-DEST[/CARRIER]`)
    process.exit(1)
  }
  return { origin, destination, carrier: carrier ? carrier.toUpperCase() : null }
})

// Print what the engine actually resolves — the distances/ccs hand-analysis
// keeps getting wrong (band edges!).
const resolved = resolveLegs(legs, lookup)
if ('error' in resolved) {
  console.error('resolve error:', resolved.error)
  process.exit(1)
}
console.log('Resolved legs:')
for (const l of resolved.legs) {
  console.log(
    `  ${l.origin}-${l.destination}  ${(l.carrier ?? '(any)').padEnd(4)}  ${String(l.distance).padStart(5)}mi  ${l.origin_cc}->${l.destination_cc}`,
  )
}
console.log(`  total: ${resolved.total_distance}mi\n`)

const fmt = (c) => (c == null ? '—' : c[0] === c[1] ? String(c[0]) : `${c[0]}-${c[1]}`)
function showEntries(entries) {
  if (!entries.length) {
    console.log('  (no entries — not bookable by this programme, or not priced)')
    return
  }
  for (const e of entries) {
    console.log(
      `  [${e.programme}] chart=${e.chart} season=${e.season}  Y=${fmt(e.economy)}  W=${fmt(e.premium_economy)}  J=${fmt(e.business)}  F=${fmt(e.first)}`,
    )
  }
}

if (progArg === 'all') {
  const out = priceItinerary(legs, lookup)
  if ('error' in out) {
    console.error(out.error)
    process.exit(1)
  }
  console.log(`Fan-out across ${Object.keys(PROGRAMMES).length} programmes — ${out.charts.length} priced:`)
  showEntries(out.charts)
} else {
  const id = resolveProgrammeId(progArg)
  if (!id) {
    console.error(`unknown programme: "${progArg}" (try a slug like etihad-guest, or an alias like saudia)`)
    process.exit(1)
  }
  console.log(`Programme: ${id}`)
  const r = priceProgramme(id, legs, lookup)
  if ('error' in r) {
    console.error('error:', r.error)
    process.exit(1)
  }
  showEntries(r.entries)
}
