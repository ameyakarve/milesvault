/**
 * LifeMiles (Avianca)
 *
 * - Avianca own-metal: dynamic (return [0,0])
 * - Star Alliance partners: unpublished zone-based chart with crowd-sourced ranges
 * - No fuel surcharges on partner awards
 *
 * Source: crowd-sourced data, last updated Mar 2026
 * HOW TO REFRESH: Update the CHARTS object below with new zone-pair pricing
 */

import { makeEntry, resolveBand } from "../../shared.js";

const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","G3","IB","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","ZH"]);

const AV_CARRIERS = new Set(["AV"]);

// Zone assignments by country code
const ZONE = {
  // US zones (need airport-level for sub-zones, but use "US" as default)
  US: "US", CA: "CA", MX: "MX",
  // Caribbean & Central America
  CU: "CB", DO: "CB", JM: "CB", BS: "CB", BB: "CB", TT: "CB", PR: "CB",
  GT: "CA_AM", HN: "CA_AM", SV: "CA_AM", NI: "CA_AM", CR: "CA_AM", PA: "CA_AM", BZ: "CA_AM",
  // South America
  CO: "SA_N", EC: "SA_N", VE: "SA_N", PE: "SA_N",
  BR: "SA_S", AR: "SA_S", CL: "SA_S", BO: "SA_S", PY: "SA_S", UY: "SA_S",
  // Europe
  GB: "EU1", IE: "EU1", SE: "EU1", NO: "EU1", DK: "EU1", FI: "EU1", IS: "EU1",
  FR: "EU2", DE: "EU2", NL: "EU2", BE: "EU2", CH: "EU2", AT: "EU2", LU: "EU2",
  IT: "EU2", ES: "EU2", PT: "EU2",
  TR: "EU3", GR: "EU3", PL: "EU3", RO: "EU3", BG: "EU3", CZ: "EU3", HU: "EU3",
  HR: "EU3", RS: "EU3", SK: "EU3", SI: "EU3", LT: "EU3", LV: "EU3", EE: "EU3",
  // Middle East / North Africa
  AE: "ME", SA: "ME", QA: "ME", BH: "ME", KW: "ME", OM: "ME", JO: "ME",
  IL: "ME", EG: "ME", MA: "ME", TN: "ME", DZ: "ME",
  // Sub-Saharan Africa
  ZA: "AF", KE: "AF", ET: "AF", NG: "AF", GH: "AF", TZ: "AF",
  // South Asia
  IN: "SA_ASIA", PK: "SA_ASIA", BD: "SA_ASIA", LK: "SA_ASIA", NP: "SA_ASIA", MV: "SA_ASIA",
  // North Asia
  JP: "NA_ASIA", KR: "NA_ASIA", CN: "NA_ASIA", HK: "NA_ASIA", TW: "NA_ASIA",
  // Southeast Asia
  TH: "SEA", SG: "SEA", MY: "SEA", ID: "SEA", PH: "SEA", VN: "SEA",
  // Oceania
  AU: "OC", NZ: "OC", FJ: "OC",
};

// Zone-pair pricing: key = sorted "Z1|Z2", value = [eMin, eMax, bMin, bMax, fMin, fMax]
// Ranges reflect sub-zone variation. 0 = not available or unknown.
function pk(a, b) { return a <= b ? `${a}|${b}` : `${b}|${a}`; }

const CHARTS = {
  // US domestic
  [pk("US","US")]: [7500, 15000, 15000, 25000, 35000, 35000],
  // US — Canada (distance-based, use range)
  [pk("US","CA")]: [6000, 12500, 15000, 25000, 0, 0],
  // US — Mexico/Caribbean/Central America
  [pk("US","MX")]: [15000, 20000, 25000, 35000, 0, 0],
  [pk("US","CB")]: [15000, 20000, 25000, 35000, 0, 0],
  [pk("US","CA_AM")]: [15000, 20000, 25000, 35000, 0, 0],
  // US — Europe
  [pk("US","EU1")]: [40000, 40000, 80000, 80000, 130000, 130000],
  [pk("US","EU2")]: [40000, 40000, 80000, 80000, 130000, 130000],
  [pk("US","EU3")]: [40000, 40000, 80000, 80000, 130000, 130000],
  // US — Middle East
  [pk("US","ME")]: [40000, 45000, 78000, 78000, 130000, 130000],
  // US — Africa
  [pk("US","AF")]: [45000, 50000, 78000, 78000, 0, 0],
  // US — South Asia (India)
  [pk("US","SA_ASIA")]: [45000, 55000, 78000, 90000, 120000, 120000],
  // US — North Asia
  [pk("US","NA_ASIA")]: [55000, 55000, 100000, 100000, 120000, 120000],
  // US — Southeast Asia
  [pk("US","SEA")]: [50000, 55000, 90000, 100000, 120000, 120000],
  // US — Oceania
  [pk("US","OC")]: [55000, 55000, 100000, 100000, 120000, 120000],

  // Intra-Europe
  [pk("EU1","EU1")]: [12500, 12500, 20000, 20000, 30000, 30000],
  [pk("EU2","EU2")]: [12500, 12500, 20000, 20000, 30000, 30000],
  [pk("EU1","EU2")]: [12500, 12500, 20000, 20000, 30000, 30000],
  [pk("EU1","EU3")]: [15000, 15000, 27000, 27000, 39000, 39000],
  [pk("EU2","EU3")]: [15000, 15000, 27000, 27000, 39000, 39000],
  [pk("EU3","EU3")]: [12500, 12500, 20000, 20000, 30000, 30000],

  // South Asia — Europe
  [pk("SA_ASIA","EU1")]: [28000, 30000, 63000, 87000, 80000, 87000],
  [pk("SA_ASIA","EU2")]: [28000, 30000, 51000, 87000, 80000, 87000],
  // South Asia — North Asia
  [pk("SA_ASIA","NA_ASIA")]: [28000, 35000, 48000, 55000, 60000, 80000],
  // South Asia — Southeast Asia
  [pk("SA_ASIA","SEA")]: [17000, 22000, 35000, 45000, 0, 0],
  // South Asia — Africa
  [pk("SA_ASIA","AF")]: [28000, 35000, 40000, 55000, 0, 0],
  // South Asia — US
  [pk("SA_ASIA","US")]: [45000, 55000, 78000, 90000, 120000, 120000],

  // Within Canada (distance-based — use range)
  [pk("CA","CA")]: [6000, 12500, 15000, 25000, 0, 0],
};

export const slug = "lifemiles";

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);

  // Avianca own-metal — dynamic
  if (carriers.length > 0 && carriers.every((c) => AV_CARRIERS.has(c))) {
    return [makeEntry("lifemiles", "dynamic", "default", 0, null, 0, null)];
  }

  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const oz = ZONE[originCC];
  const dz = ZONE[destCC];
  if (!oz || !dz) return [];

  const key = oz <= dz ? `${oz}|${dz}` : `${dz}|${oz}`;
  const chart = CHARTS[key];
  if (!chart) return [];

  const [eMin, eMax, bMin, bMax, fMin, fMax] = chart;
  const wrap = (lo, hi) => (lo === 0 && hi === 0) ? null : [lo, hi];

  return [{
    programme: "lifemiles", chart: "partner", season: "default",
    economy: wrap(eMin, eMax),
    premium_economy: null,
    business: wrap(bMin, bMax),
    first: wrap(fMin, fMax),
  }];
}
