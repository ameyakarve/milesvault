/**
 * Mabuhay Miles (Philippine Airlines) — Zone-based chart
 *
 * PR own-metal: zone-based from Manila. Limited published data.
 * Only known rates: domestic minimum, some business fares, upgrade chart.
 * Returns available data where zones match, [] for unknown pairs.
 *
 * Source: vault Award Charts/Mabuhay Miles.md
 * HOW TO REFRESH: Update zone maps and charts below when full chart is published
 */

import { makeEntry } from "../../shared.js";

const BOOKABLE = new Set(["PR"]);

const PR_CARRIERS = new Set(["PR"]);

// Zone mapping centred on Manila
const ZONE = {
  PH: "PH",      // Domestic Philippines
  HK: "NEA",     // Near East Asia (HK, Macau, Taiwan, China regional)
  MO: "NEA",
  TW: "NEA",
  CN: "NEA",
  // Southeast Asia
  SG: "SEA", TH: "SEA", MY: "SEA", ID: "SEA", VN: "SEA",
  KH: "SEA", MM: "SEA", LA: "SEA",
  // Japan / Korea
  JP: "JP", KR: "JP",
  // North America West Coast
  US: "NAM",
  CA: "NAM",
  // Europe
  GB: "EU", FR: "EU", DE: "EU",
  // Middle East
  AE: "ME", SA: "ME", QA: "ME", BH: "ME", KW: "ME", OM: "ME",
  // India / Subcontinent
  IN: "SA", PK: "SA", BD: "SA", LK: "SA", NP: "SA",
  // Australia
  AU: "OC", NZ: "OC",
};

// West Coast airports for NAM_W zone split
const NAM_W_AIRPORTS = new Set(["LAX","SFO","SJC","YVR"]);
const NAM_E_AIRPORTS = new Set(["JFK","EWR","ORD","YYZ","IAD"]);

function getZone(cc, airport) {
  if (cc === "US" || cc === "CA") {
    if (NAM_W_AIRPORTS.has(airport)) return "NAM_W";
    if (NAM_E_AIRPORTS.has(airport)) return "NAM_E";
    return "NAM";
  }
  return ZONE[cc] || null;
}

// Known one-way pricing from Manila (PH)
// [economy, premEcon, business]
const FROM_PH = {
  PH:     [4500, null, null],       // Domestic average
  NEA:    [null, null, null],       // No published data
  SEA:    [null, null, 15000],      // Upgrade chart suggests ~15K biz for SEA
  JP:     [null, null, null],
  NAM_W:  [null, null, 58000],     // Business to West Coast
  NAM_E:  [null, null, 67000],     // Business to East Coast / Toronto
  NAM:    [null, null, 58000],     // Default to West Coast
  EU:     [null, null, null],
  ME:     [null, null, null],
  SA:     [null, null, null],
  OC:     [null, null, null],
};

export const slug = "mabuhay-miles";

export const bookable = BOOKABLE;

export function handle(legs) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;

  const isPHOrigin = originCC === "PH";
  const isPHDest = destCC === "PH";

  // Mabuhay Miles is centred on Manila — one end should be PH
  if (!isPHOrigin && !isPHDest) return [];

  const foreignCC = isPHOrigin ? destCC : originCC;
  const foreignApt = isPHOrigin ? legs[legs.length - 1].destination : legs[0].origin;
  const zone = getZone(foreignCC, foreignApt);

  if (!zone) return [];

  const row = FROM_PH[zone];
  if (!row) return [];

  const [e, pe, b] = row;
  // If all null, no data — return empty
  if (e === null && pe === null && b === null) return [];

  const wrap = (v) => v === null ? null : [v, v];
  return [{
    programme: "mabuhay", chart: "own", season: "default",
    economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: null,
  }];
}
