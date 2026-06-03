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

export const PROGRAMMES = {
  aadvantage, aeroplan, airindia, alfursan, ana, asiamiles, atmos, ba,
  cedarmiles, clubpremier, connectmiles, delta, dynastyflyer, easternmiles,
  egretclub, emirates, enrich, etihad, eurobonus, eva, finnair, flyingblue,
  flyingclub, flysmiles, iberia, jalmb, krisflyer, latampass, lifemiles,
  lotusmiles, mabuhay, milesbonus, milesgo, milesmore, phoenixmiles, qantas,
  qatar, royalorchid, shebamiles, shenzhen, sindbad, skypass, turkish, united,
  velocity,
}

// Free-text programme name → id. Covers common programme/airline names; the
// resolver also falls back to substring matching against the ids.
const ALIASES = {
  american: 'aadvantage', 'american airlines': 'aadvantage', aa: 'aadvantage',
  'air canada': 'aeroplan', ac: 'aeroplan',
  'air india': 'airindia', ai: 'airindia', maharaja: 'airindia',
  'maharaja club': 'airindia', 'flying returns': 'airindia',
  saudia: 'alfursan', 'al fursan': 'alfursan', sv: 'alfursan',
  'all nippon': 'ana', 'ana mileage club': 'ana', nh: 'ana',
  cathay: 'asiamiles', 'cathay pacific': 'asiamiles', 'asia miles': 'asiamiles', cx: 'asiamiles',
  'british airways': 'ba', avios: 'ba', 'executive club': 'ba',
  mea: 'cedarmiles', 'middle east airlines': 'cedarmiles', 'cedar miles': 'cedarmiles',
  aeromexico: 'clubpremier', 'club premier': 'clubpremier', am: 'clubpremier',
  copa: 'connectmiles', cm: 'connectmiles',
  skymiles: 'delta', dl: 'delta',
  'china airlines': 'dynastyflyer', dynasty: 'dynastyflyer', ci: 'dynastyflyer',
  'china eastern': 'easternmiles', 'eastern miles': 'easternmiles', mu: 'easternmiles',
  skywards: 'emirates', ek: 'emirates',
  'malaysia airlines': 'enrich', mh: 'enrich',
  'etihad guest': 'etihad', ey: 'etihad',
  sas: 'eurobonus', sk: 'eurobonus',
  'eva air': 'eva', 'infinity mileagelands': 'eva', br: 'eva',
  'finnair plus': 'finnair', ay: 'finnair',
  'air france': 'flyingblue', klm: 'flyingblue', 'flying blue': 'flyingblue', af: 'flyingblue', kl: 'flyingblue',
  'virgin atlantic': 'flyingclub', 'flying club': 'flyingclub', vs: 'flyingclub',
  srilankan: 'flysmiles', ul: 'flysmiles',
  'iberia plus': 'iberia', ib: 'iberia',
  jal: 'jalmb', 'japan airlines': 'jalmb', 'mileage bank': 'jalmb', jl: 'jalmb',
  'singapore airlines': 'krisflyer', sq: 'krisflyer',
  latam: 'latampass', 'latam pass': 'latampass', la: 'latampass',
  avianca: 'lifemiles', av: 'lifemiles',
  'vietnam airlines': 'lotusmiles', vn: 'lotusmiles',
  'philippine airlines': 'mabuhay', pr: 'mabuhay',
  aegean: 'milesbonus', 'miles and bonus': 'milesbonus', a3: 'milesbonus',
  tap: 'milesgo', 'tap air portugal': 'milesgo', 'miles and go': 'milesgo', tp: 'milesgo',
  lufthansa: 'milesmore', 'miles and more': 'milesmore', 'miles & more': 'milesmore', lh: 'milesmore',
  'air china': 'phoenixmiles', ca: 'phoenixmiles',
  'qantas frequent flyer': 'qantas', qf: 'qantas',
  'qatar airways': 'qatar', 'privilege club': 'qatar', qr: 'qatar',
  thai: 'royalorchid', 'thai airways': 'royalorchid', 'royal orchid': 'royalorchid', tg: 'royalorchid',
  ethiopian: 'shebamiles', et: 'shebamiles',
  'shenzhen airlines': 'shenzhen', zh: 'shenzhen',
  'oman air': 'sindbad', wy: 'sindbad',
  'korean air': 'skypass', ke: 'skypass',
  'turkish airlines': 'turkish', 'miles and smiles': 'turkish', 'miles&smiles': 'turkish', tk: 'turkish',
  mileageplus: 'united', ua: 'united',
  'virgin australia': 'velocity', va: 'velocity',
}

export function resolveProgrammeId(text) {
  if (!text) return null
  const k = String(text).trim().toLowerCase().replace(/\s+/g, ' ')
  if (PROGRAMMES[k]) return k
  if (ALIASES[k]) return ALIASES[k]
  for (const id of Object.keys(PROGRAMMES)) {
    if (k.includes(id) || id.includes(k)) return id
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
  return { entries, resolved: r }
}

// Fan-out: price across every programme that can book the itinerary.
export function priceItinerary(legs, lookup) {
  const r = resolveLegs(legs, lookup)
  if (r.error) return { error: r.error }
  const carriers = r.legs.map((l) => l.carrier).filter(Boolean)
  const charts = []
  for (const mod of Object.values(PROGRAMMES)) {
    if (!canBook(mod, carriers)) continue
    charts.push(...(mod.handle(r.legs, r.total_distance) || []))
  }
  return { legs: r.legs, total_distance: r.total_distance, charts }
}
