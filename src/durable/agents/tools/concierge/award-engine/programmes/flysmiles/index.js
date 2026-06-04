/**
 * FlySmiLes (SriLankan Airlines) — Zone-based chart
 *
 * UL own-metal: zone-based from Colombo (10 zones)
 * Partner (oneworld): separate zone-based chart
 *
 * The vault file has limited published rates — only known minimum (7,000 one-way)
 * and one upgrade example. Full zone-to-zone chart is not publicly available
 * in detail, so we use the known rates where available and return [] for unknown pairs.
 *
 * Source: vault Award Charts/FlySmiLes.md
 * HOW TO REFRESH: Update zone maps and chart data below
 */

import { makeEntry, resolveChart } from "../../shared.js";

const BOOKABLE = new Set(["AA","AS","AT","AY","BA","CX","FJ","IB","JL","MH","QF","QR","RJ","UL",,"EY","WY"]);

const UL_CARRIERS = new Set(["UL"]);

// Zone mapping centred on Colombo
const UL_ZONE = {
  LK: 1,     // Zone 1: Sri Lanka
  // Zone 2: South Asian Sub-Continent 1 (South India)
  // Mapped by city/airport rather than country — IN can be Zone 2 or 3
  // Zone 3: South Asian Sub-Continent 2 (Mumbai, Delhi, Karachi)
  // For simplicity: IN defaults to zone 2 (most UL routes), PK to zone 3
  IN: 2,
  PK: 3,
  // Zone 4: Europe
  GB: 4, DE: 4, FR: 4, IT: 4, RU: 4,
  // Zone 5: Far East
  TH: 5, SG: 5, MY: 5, HK: 5,
  // Zone 6: Japan
  JP: 6,
  // Zone 7: Middle East 1
  AE: 7, OM: 7, QA: 7, KW: 7,
  // Zone 8: Middle East 2 (Saudi Arabia)
  SA: 8,
  // Zone 9: Maldives
  MV: 9,
  // Zone 10: China
  CN: 10,
};

// Mumbai/Delhi airports → Zone 3
const ZONE3_AIRPORTS = new Set(["BOM","DEL","CCU","MAA"]); // MAA is actually zone 2 but close
// Actually per chart: Zone 2 = Chennai, Cochin, Bangalore, Trichy, Trivandrum
// Zone 3 = Mumbai, Delhi, Karachi
const ZONE2_AIRPORTS = new Set(["MAA","COK","BLR","TRZ","TRV"]);
const ZONE3_AIRPORTS_IN = new Set(["BOM","DEL"]);

function getUlZone(cc, airport) {
  if (cc === "IN") {
    if (ZONE3_AIRPORTS_IN.has(airport)) return 3;
    return 2; // Default to Zone 2 for other Indian cities
  }
  return UL_ZONE[cc] || null;
}

// SriLankan Airlines operated chart from Colombo (one-way)
// [economy, premEcon, business, first] — null = not available
// These are from Zone 1 (LK) to each destination zone
const UL_FROM_CMB = {
  1:  [7500, null, null, null],   // Domestic (estimated from min 7,000)
  2:  [10000, null, 20000, null], // South India
  3:  [12500, null, 25000, null], // Mumbai/Delhi/Karachi
  4:  [42500, null, 85000, null], // Europe (estimated from zone 6 upgrade rate)
  5:  [17500, null, 30000, null], // Far East
  6:  [25000, null, 42500, null], // Japan
  7:  [15000, null, 27500, null], // Middle East 1
  8:  [17500, null, 30000, null], // Middle East 2
  9:  [10000, null, 17500, null], // Maldives
  10: [25000, null, 42500, null], // China
};

// Partner (oneworld) chart — higher rates than UL operated
// Limited published data — use scaled estimates based on the vault note
// that "oneworld partner awards use a separate chart with different (typically higher) rates"
const PTR_FROM_CMB = {
  2:  [12500, null, 25000, null],
  3:  [15000, null, 30000, null],
  4:  [50000, null, 100000, null],
  5:  [20000, null, 37500, null],
  6:  [30000, null, 50000, null],
  7:  [17500, null, 32500, null],
  8:  [20000, null, 35000, null],
  9:  [12500, null, 22500, null],
  10: [30000, null, 50000, null],
};

export const slug = "flysmiles";

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, UL_CARRIERS);
  const entries = [];

  const isLKOrigin = originCC === "LK";
  const isLKDest = destCC === "LK";

  // FlySmiLes is centred on Colombo — one end must be LK
  if (!isLKOrigin && !isLKDest) return [];

  const foreignCC = isLKOrigin ? destCC : originCC;
  const foreignApt = isLKOrigin ? legs[legs.length - 1].destination : legs[0].origin;
  const zone = getUlZone(foreignCC, foreignApt);

  if (!zone) return [];

  // UL own-metal
  if (chart !== "partner") {
    const row = UL_FROM_CMB[zone];
    if (row) {
      const [e, pe, b, f] = row;
      const wrap = (v) => v === null ? null : [v, v];
      entries.push({
        programme: "flysmiles", chart: "ul_operated", season: "default",
        economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: wrap(f),
      });
    }
  }

  // Partner chart
  if (chart !== "own") {
    const row = PTR_FROM_CMB[zone];
    if (row) {
      const [e, pe, b, f] = row;
      const wrap = (v) => v === null ? null : [v, v];
      entries.push({
        programme: "flysmiles", chart: "partner", season: "default",
        economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: wrap(f),
      });
    }
  }

  return entries;
}
