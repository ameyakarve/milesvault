// Award-pricing engine — ported from the standalone reference. Pure JS,
// framework-agnostic: programme modules each export `bookable` (carrier
// IATA Set) + `handle(legs, totalDistance)` → entries with [min,max] miles
// per cabin. Leg resolution (distance + country code) runs against an
// injected airport lookup (the ConciergeDO SQLite), not the reference's KV.

import { haversine } from './shared.js'

import * as aadvantage from './programmes/aadvantage/index.js'
import * as aeroplan from './programmes/aeroplan/index.js'
import * as airindia from './programmes/airindia/index.js'
import * as alfursan from './programmes/alfursan/index.js'
import * as ana from './programmes/ana/index.js'
import * as asiamiles from './programmes/asiamiles/index.js'
import * as atmos from './programmes/atmos/index.js'
import * as ba from './programmes/ba/index.js'
import * as cedarmiles from './programmes/cedarmiles/index.js'
import * as clubpremier from './programmes/clubpremier/index.js'
import * as connectmiles from './programmes/connectmiles/index.js'
import * as delta from './programmes/delta/index.js'
import * as dynastyflyer from './programmes/dynastyflyer/index.js'
import * as easternmiles from './programmes/easternmiles/index.js'
import * as egretclub from './programmes/egretclub/index.js'
import * as emirates from './programmes/emirates/index.js'
import * as enrich from './programmes/enrich/index.js'
import * as etihad from './programmes/etihad/index.js'
import * as eurobonus from './programmes/eurobonus/index.js'
import * as eva from './programmes/eva/index.js'
import * as finnair from './programmes/finnair/index.js'
import * as flyingblue from './programmes/flyingblue/index.js'
import * as flyingclub from './programmes/flyingclub/index.js'
import * as flysmiles from './programmes/flysmiles/index.js'
import * as iberia from './programmes/iberia/index.js'
import * as jalmb from './programmes/jalmb/index.js'
import * as krisflyer from './programmes/krisflyer/index.js'
import * as latampass from './programmes/latampass/index.js'
import * as lifemiles from './programmes/lifemiles/index.js'
import * as lotusmiles from './programmes/lotusmiles/index.js'
import * as mabuhay from './programmes/mabuhay/index.js'
import * as milesbonus from './programmes/milesbonus/index.js'
import * as milesgo from './programmes/milesgo/index.js'
import * as milesmore from './programmes/milesmore/index.js'
import * as phoenixmiles from './programmes/phoenixmiles/index.js'
import * as qantas from './programmes/qantas/index.js'
import * as qatar from './programmes/qatar/index.js'
import * as royalorchid from './programmes/royalorchid/index.js'
import * as shebamiles from './programmes/shebamiles/index.js'
import * as shenzhen from './programmes/shenzhen/index.js'
import * as sindbad from './programmes/sindbad/index.js'
import * as skypass from './programmes/skypass/index.js'
import * as turkish from './programmes/turkish/index.js'
import * as united from './programmes/united/index.js'
import * as velocity from './programmes/velocity/index.js'

// Each programme module declares its own milesvault-kg slug (its `slug`
// export — the switching-basis label). PROGRAMMES is keyed by that slug, so
// the engine, the KB graph, and the agent all speak one set of programme ids
// with no translation table: the module owns its id, the map is derived.
const MODULES = [
  aadvantage, aeroplan, airindia, alfursan, ana, asiamiles, atmos, ba,
  cedarmiles, clubpremier, connectmiles, delta, dynastyflyer, easternmiles,
  egretclub, emirates, enrich, etihad, eurobonus, eva, finnair, flyingblue,
  flyingclub, flysmiles, iberia, jalmb, krisflyer, latampass, lifemiles,
  lotusmiles, mabuhay, milesbonus, milesgo, milesmore, phoenixmiles, qantas,
  qatar, royalorchid, shebamiles, shenzhen, sindbad, skypass, turkish, united,
  velocity,
]

export const PROGRAMMES = Object.fromEntries(MODULES.map((m) => [m.slug, m]))

// Free-text programme name → id. Covers common programme/airline names; the
// resolver also falls back to substring matching against the ids.
const ALIASES = {
  american: 'aadvantage', 'american airlines': 'aadvantage', aa: 'aadvantage',
  'air canada': 'aeroplan', ac: 'aeroplan',
  'air india': 'maharaja-club', ai: 'maharaja-club', maharaja: 'maharaja-club',
  'maharaja club': 'maharaja-club', 'flying returns': 'maharaja-club',
  saudia: 'alfursan', 'al fursan': 'alfursan', sv: 'alfursan',
  'all nippon': 'ana-mileage-club', 'ana mileage club': 'ana-mileage-club', nh: 'ana-mileage-club',
  cathay: 'asia-miles', 'cathay pacific': 'asia-miles', 'asia miles': 'asia-miles', cx: 'asia-miles',
  'british airways': 'avios', avios: 'avios', 'executive club': 'avios',
  mea: 'cedar-miles', 'middle east airlines': 'cedar-miles', 'cedar miles': 'cedar-miles',
  aeromexico: 'club-premier', 'club premier': 'club-premier', am: 'club-premier',
  copa: 'connectmiles', cm: 'connectmiles',
  skymiles: 'delta-skymiles', dl: 'delta-skymiles',
  'china airlines': 'dynasty-flyer', dynasty: 'dynasty-flyer', ci: 'dynasty-flyer',
  'china eastern': 'eastern-miles', 'eastern miles': 'eastern-miles', mu: 'eastern-miles',
  skywards: 'emirates-skywards', ek: 'emirates-skywards',
  'malaysia airlines': 'enrich', mh: 'enrich',
  'etihad guest': 'etihad-guest', ey: 'etihad-guest',
  sas: 'eurobonus', sk: 'eurobonus',
  'eva air': 'infinity-mileagelands', 'infinity mileagelands': 'infinity-mileagelands', br: 'infinity-mileagelands',
  'finnair plus': 'finnair-plus', ay: 'finnair-plus',
  'air france': 'flying-blue', klm: 'flying-blue', 'flying blue': 'flying-blue', af: 'flying-blue', kl: 'flying-blue',
  'virgin atlantic': 'flying-club', 'flying club': 'flying-club', vs: 'flying-club',
  srilankan: 'flysmiles', ul: 'flysmiles',
  'iberia plus': 'iberia-plus', ib: 'iberia-plus',
  jal: 'jal-mileage-bank', 'japan airlines': 'jal-mileage-bank', 'mileage bank': 'jal-mileage-bank', jl: 'jal-mileage-bank',
  'singapore airlines': 'krisflyer', sq: 'krisflyer',
  latam: 'latam-pass', 'latam pass': 'latam-pass', la: 'latam-pass',
  avianca: 'lifemiles', av: 'lifemiles',
  'vietnam airlines': 'lotusmiles', vn: 'lotusmiles',
  'philippine airlines': 'mabuhay-miles', pr: 'mabuhay-miles',
  aegean: 'miles-and-bonus', 'miles and bonus': 'miles-and-bonus', a3: 'miles-and-bonus',
  tap: 'miles-and-go', 'tap air portugal': 'miles-and-go', 'miles and go': 'miles-and-go', tp: 'miles-and-go',
  lufthansa: 'miles-and-more', 'miles and more': 'miles-and-more', 'miles & more': 'miles-and-more', lh: 'miles-and-more',
  'air china': 'phoenixmiles', ca: 'phoenixmiles',
  'qantas frequent flyer': 'qantas-frequent-flyer', qf: 'qantas-frequent-flyer',
  'qatar airways': 'qatar-privilege-club', 'privilege club': 'qatar-privilege-club', qr: 'qatar-privilege-club',
  thai: 'royal-orchid-plus', 'thai airways': 'royal-orchid-plus', 'royal orchid': 'royal-orchid-plus', tg: 'royal-orchid-plus',
  ethiopian: 'shebamiles', et: 'shebamiles',
  'shenzhen airlines': 'shenzhen-phoenix-miles', zh: 'shenzhen-phoenix-miles',
  'oman air': 'sindbad', wy: 'sindbad',
  'korean air': 'skypass', ke: 'skypass',
  'turkish airlines': 'turkish-miles-and-smiles', 'miles and smiles': 'turkish-miles-and-smiles', 'miles&smiles': 'turkish-miles-and-smiles', tk: 'turkish-miles-and-smiles',
  mileageplus: 'united-mileageplus', ua: 'united-mileageplus',
  'virgin australia': 'velocity-frequent-flyer', va: 'velocity-frequent-flyer',
}

export function resolveProgrammeId(text) {
  if (!text) return null
  // Programme keys ARE the milesvault-kg slugs. Accept a full `program/<slug>`
  // or the bare slug as an exact hit first (hyphens intact).
  const raw = String(text).trim().toLowerCase().replace(/^program\//, '')
  if (PROGRAMMES[raw]) return raw
  // Otherwise treat the input as free text: normalize hyphens/spaces and match
  // aliases, then WHOLE-WORD containment against programme keys (hyphen →
  // space) and alias phrases. Word boundaries only — never match an id inside
  // a larger word (the old substring match sent "jal mileage bank" → "ba"
  // via "bank"). Re-keying also removed the 2-letter `ba` key entirely.
  const k = raw.replace(/[\s\-]+/g, ' ')
  if (PROGRAMMES[k]) return k
  if (ALIASES[k]) return ALIASES[k]
  const word = (needle) => new RegExp(`(^| )${needle}( |$)`).test(k)
  for (const id of Object.keys(PROGRAMMES)) {
    if (word(id.replace(/-/g, ' '))) return id
  }
  for (const phrase of Object.keys(ALIASES)) {
    if (word(phrase)) return ALIASES[phrase]
  }
  return null
}

// lookup: (iata) => [lat, lng, cc] | null
export function resolveLegs(legs, lookup) {
  const enriched = []
  for (const l of legs) {
    const o = String(l.origin).toUpperCase()
    const d = String(l.destination).toUpperCase()
    const a = lookup(o)
    const b = lookup(d)
    if (!a || !b) {
      const missing = [!a ? o : null, !b ? d : null].filter(Boolean).join(', ')
      return { error: `unknown_airport: ${missing}` }
    }
    enriched.push({
      origin: o,
      destination: d,
      carrier: l.carrier ? String(l.carrier).toUpperCase() : null,
      distance: haversine(a[0], a[1], b[0], b[1]),
      origin_cc: a[2],
      destination_cc: b[2],
    })
  }
  return { legs: enriched, total_distance: enriched.reduce((s, l) => s + l.distance, 0) }
}

function canBook(mod, carriers) {
  if (carriers.length === 0) return true
  return carriers.every((c) => mod.bookable.has(c))
}

// Price one programme for an itinerary. Returns rich entries (or []).
export function priceProgramme(id, legs, lookup) {
  const mod = PROGRAMMES[id]
  if (!mod) return { error: 'unknown_programme' }
  const r = resolveLegs(legs, lookup)
  if (r.error) return { error: r.error }
  const carriers = r.legs.map((l) => l.carrier).filter(Boolean)
  if (!canBook(mod, carriers)) return { entries: [], resolved: r }
  const entries = mod.handle(r.legs, r.total_distance) || []
  // Canonicalize the programme label to the key (a milesvault-kg slug) so
  // entries report the same id everywhere, regardless of the legacy short
  // name a module hardcodes in makeEntry.
  for (const e of entries) e.programme = id
  return { entries, resolved: r }
}

// Fan-out: price across every programme that can book the itinerary.
export function priceItinerary(legs, lookup) {
  const r = resolveLegs(legs, lookup)
  if (r.error) return { error: r.error }
  const carriers = r.legs.map((l) => l.carrier).filter(Boolean)
  const charts = []
  for (const [id, mod] of Object.entries(PROGRAMMES)) {
    if (!canBook(mod, carriers)) continue
    const entries = mod.handle(r.legs, r.total_distance) || []
    for (const e of entries) e.programme = id // canonicalize to the KB slug key
    charts.push(...entries)
  }
  return { legs: r.legs, total_distance: r.total_distance, charts }
}
