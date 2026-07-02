/**
 * Qatar Privilege Club
 *
 * - QR own-metal: route-specific pricing (Off-Peak/Peak/Flexi), not distance-based
 *   Return [offpeak, peak] ranges for known route categories from Doha
 * - Partner: distance-based chart (9 bands), per-segment additive
 * - AA/AS: separate chart for under 3,000mi
 * - LATAM: separate chart
 *
 * Source: qatarairways.com + vault Award Charts/Qatar Privilege Club.md
 * HOW TO REFRESH: Update charts below, verify via QR's "My Calculator" tool
 */

import { makeEntry, resolveBand } from "../../shared.js";

const BOOKABLE = new Set(["AA","AS","AT","AY","B6","BA","CX","FJ","GA","HA","IB","JL","LA","ME","MF","MH","PG","QF","QR","RJ","UL","VA","WY"]);

const QR_CARRIERS = new Set(["QR"]);
const AA_AS_CARRIERS = new Set(["AA", "AS"]);
const LA_CARRIERS = new Set(["LA"]);

// Partner chart — 9 distance bands [economy, premEcon, business, first]
const PTR_BANDS = [650, 1151, 2000, 3000, 4000, 5500, 6500, 7000, Infinity];
const PTR_CHART = [
  [6000, 9000, 12500, 24000],
  [9000, 12500, 16500, 33000],
  [11000, 16500, 22000, 44000],
  [13000, 25250, 38750, 51500],
  [20750, 41250, 62000, 82500],
  [25750, 51500, 77250, 103000],
  [31000, 62000, 92750, 123750],
  [36250, 72250, 108250, 144250],
  [51500, 103000, 154500, 206000],
];

// AA/Alaska chart — under 3000mi only [economy, bizFirst]
const AA_BANDS = [650, 1151, 2000, 3000];
const AA_CHART = [
  [9500, 20000],
  [13000, 27000],
  [14500, 34000],
  [16000, 43000],
];

// LATAM chart [economy, business]
const LA_BANDS = [650, 1151, 2000, 3000, 4000, 5000];
const LA_CHART = [
  [6000, 0],
  [9000, 16500],
  [11000, 22000],
  [13000, 38750],
  [20750, 62000],
  [25750, 77250],
];

// QR own-metal Avios — SEASONAL. Qatar actually runs THREE tiers: off-peak, peak
// (~1.35x off-peak), and Flexi (~2x off-peak). We currently model only two values
// per zone: the off-peak floor and the ~2x upper — so the upper number is really
// FLEXI, and the middle "peak" tier (~1.35x, e.g. US-DOH business ~94.5k) is not
// captured; the buildPrice split labels them off-peak/peak generically.
// TODO(qatar 3-tier): add the middle peak value per zone and relabel the tiers
// off-peak / peak / Flexi. First class and Flexi are unaffected by peak dates.
//
// [econ_off, econ_peak, biz_off, biz_peak, first_off, first_peak]  (0/0 => cabin
// not offered; wrapped to null). Values reconstructed from seats.aero QR-operated
// award data (source=qatar, Sep 2026–Mar 2027): off-peak = the lowest dominant
// fare tier per region, peak = the highest. QR's own "My Calculator" is the
// canonical source but is Akamai-blocked to automated access.
//
// First class kept ONLY where QR actually flies it (A380: Europe-long, SE Asia,
// East Asia). NAM/SAM/OC/Africa/India show no first inventory — first dropped.
const QR_OWN = {
  // Middle East short
  ME_SHORT: [7000, 8000, 14000, 28000, 0, 0],
  // Indian Subcontinent
  IS: [13000, 15000, 26000, 52000, 0, 0],
  // Europe short (Greece, Turkey, Cyprus)
  EU_SHORT: [17500, 35000, 35000, 70000, 0, 0],
  // Europe long
  EU_LONG: [21500, 24500, 43000, 86000, 64500, 86000],
  // Southeast Asia
  SEA: [25000, 30000, 50000, 100000, 75000, 150000],
  // East Asia
  EA: [30000, 60000, 60000, 120000, 75000, 150000],
  // Southern Africa (e.g. JNB, CPT) — farther from DOH, priced higher
  AF_S: [22500, 45000, 45000, 90000, 0, 0],
  // East Africa (e.g. NBO, DAR, ADD) — closer, priced lower
  AF_E: [17500, 20000, 35000, 70000, 0, 0],
  // North America
  NAM: [35000, 70000, 70000, 140000, 0, 0],
  // South America
  SAM: [35000, 70000, 70000, 140000, 0, 0],
  // Oceania
  OC: [35000, 70000, 70000, 140000, 0, 0],
};

// TODO (QR own-metal): values are seats-reconstructed because QR's My Calculator
// is Akamai-blocked — refresh from the calculator when access is possible.
// Known limitations:
//  - Through-journeys via DOH price on the DESTINATION zone only (nonstop-equivalent);
//    e.g. India->US via DOH bills at NAM peak 140k, but seats shows the through
//    itinerary ~160k — the DEL–DOH feeder segment (~+20k) is not added.
//  - AF_S / AF_E boundary below is a geographic approximation (QR may price by
//    distance); West/Central Africa (NG, GH, etc.) is unmapped.
//  - ME_SHORT/EU_SHORT business-peak partly inferred from the 2x pattern (thin data).
//  - Route-level outliers exist (e.g. Kathmandu prices above the IS zone); the zone
//    modal is used deliberately.

const QR_DEST_ZONE = {
  // ME short
  BH: "ME_SHORT", OM: "ME_SHORT", KW: "ME_SHORT",
  // IS
  IN: "IS", PK: "IS", LK: "IS", BD: "IS", NP: "IS", MV: "IS",
  // Europe short
  GR: "EU_SHORT", TR: "EU_SHORT", CY: "EU_SHORT",
  // Europe long
  GB: "EU_LONG", FR: "EU_LONG", DE: "EU_LONG", IT: "EU_LONG", ES: "EU_LONG",
  NL: "EU_LONG", CH: "EU_LONG", AT: "EU_LONG", SE: "EU_LONG", NO: "EU_LONG",
  DK: "EU_LONG", FI: "EU_LONG", IE: "EU_LONG", PT: "EU_LONG", PL: "EU_LONG",
  BE: "EU_LONG", CZ: "EU_LONG", HU: "EU_LONG",
  // Southeast Asia
  TH: "SEA", SG: "SEA", MY: "SEA", ID: "SEA", PH: "SEA", VN: "SEA",
  // East Asia
  JP: "EA", KR: "EA", CN: "EA", HK: "EA", TW: "EA",
  // Southern Africa (farther from DOH)
  ZA: "AF_S", AO: "AF_S", NA: "AF_S", BW: "AF_S", ZW: "AF_S", ZM: "AF_S",
  MZ: "AF_S", MU: "AF_S", MG: "AF_S", MW: "AF_S",
  // East Africa (closer to DOH)
  KE: "AF_E", TZ: "AF_E", ET: "AF_E", UG: "AF_E", RW: "AF_E", DJ: "AF_E",
  // North America
  US: "NAM", CA: "NAM",
  // South America
  BR: "SAM", AR: "SAM", CL: "SAM",
  // Oceania
  AU: "OC", NZ: "OC",
};

export const slug = "qatar-privilege-club";

export const bookable = BOOKABLE;

export function handle(legs, _totalDistance) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const entries = [];

  // QR own-metal — route-specific [offpeak, peak] ranges
  if (carriers.length > 0 && carriers.every((c) => QR_CARRIERS.has(c))) {
    const destCC = legs[legs.length - 1].destination_cc;
    const originCC = legs[0].origin_cc;
    // Determine which end is not Qatar (QA)
    const foreignCC = originCC === "QA" ? destCC : (destCC === "QA" ? originCC : destCC);
    const zone = QR_DEST_ZONE[foreignCC];
    if (zone) {
      const r = QR_OWN[zone];
      const wrap = (lo, hi) => (lo === 0 && hi === 0) ? null : [lo, hi];
      entries.push({
        programme: "qatar", chart: "own", season: "default",
        economy: [r[0], r[1]],
        premium_economy: null,
        business: [r[2], r[3]],
        first: wrap(r[4], r[5]),
      });
    } else {
      entries.push(makeEntry("qatar", "own", "default", 0, null, 0, null));
    }
    return entries;
  }

  // Partner awards — per-segment additive
  for (const leg of legs) {
    const dist = leg.distance;
    const carrier = leg.carrier;

    if (carrier && AA_AS_CARRIERS.has(carrier) && dist <= 3000) {
      // AA/AS short-haul chart
      const idx = resolveBand(dist, AA_BANDS);
      const [e, bf] = AA_CHART[idx];
      entries.push(makeEntry("qatar", "partner_aa", "default", e, null, bf, null));
    } else if (carrier && LA_CARRIERS.has(carrier) && dist <= 5000) {
      // LATAM chart
      const idx = resolveBand(dist, LA_BANDS);
      const [e, b] = LA_CHART[idx];
      entries.push(makeEntry("qatar", "partner_latam", "default", e, null, b, null));
    } else {
      // General partner chart
      const idx = resolveBand(dist, PTR_BANDS);
      const [e, pe, b, f] = PTR_CHART[idx];
      entries.push(makeEntry("qatar", "partner", "default", e, pe, b, f));
    }
  }

  // Sum if multiple segments (per-segment additive)
  if (entries.length > 1) {
    const totals = { economy: 0, premium_economy: 0, business: 0, first: 0 };
    let chartName = "partner";
    for (const entry of entries) {
      for (const cabin of ["economy", "premium_economy", "business", "first"]) {
        if (entry[cabin]) totals[cabin] += entry[cabin][0];
      }
      chartName = entry.chart;
    }
    const wrap = (v) => v === 0 ? null : [v, v];
    return [{
      programme: "qatar", chart: chartName, season: "default",
      economy: wrap(totals.economy), premium_economy: wrap(totals.premium_economy),
      business: wrap(totals.business), first: wrap(totals.first),
    }];
  }

  return entries;
}
