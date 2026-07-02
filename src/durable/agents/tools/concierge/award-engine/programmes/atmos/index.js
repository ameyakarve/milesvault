/**
 * Atmos Rewards (Alaska Airlines) — Distance-based with regional charts
 *
 * - Own-metal (AS/HA): 5-band distance chart
 * - Partner: 3 regional charts (Americas, EMEA, Asia-Pacific) with 6 bands each
 *
 * Region selection: if either origin or destination is in Asia-Pacific, use APAC chart.
 * Otherwise if either is in EMEA, use EMEA chart. Otherwise Americas.
 *
 * Source: vault Award Charts/Atmos Rewards.md
 */

import { makeEntry, resolveBand } from "../../shared.js";

const BOOKABLE = new Set(["AA","AS","AT","AY","BA","CX","DE","EI","FI","FJ","HU","IB","JL","JX","KE","MH","PD","QF","QR","RJ","TN","UL","WY"]);

const OWN_CARRIERS = new Set(["AS", "HA"]);

// Own-metal chart [economy, first]. Bands 3-4 economy raised to the minima
// observed across TWO independent instruments (seats.aero + Roame SkyView,
// 2026-07-02): band 3 SEA-ANC bottoms at 12,500 (never 10,000); band 4
// SEA-JFK bottoms at 17,500 (never 12,500). Band-2 Y 7,500 and F 25,000
// verified exact. (A seats.aero "business 20,000" sighting on LAX-SEA was a
// cabin-mapping artifact — Roame shows First at exactly 25,000.)
const OWN_BANDS = [700, 1400, 2100, 3500, Infinity];
const OWN_CHART = [
  [4500, 15000], [7500, 25000], [12500, 25000], [17500, 30000], [20000, 60000],
];

// Americas partner chart [econ, premEcon, biz, first]
const AM_BANDS = [700, 1400, 2100, 4000, 6000, Infinity];
const AM_CHART = [
  [4500, 6000, 9000, 13500], [7500, 10000, 15000, 25000], [12500, 17500, 25000, 40000],
  [17500, 22500, 35000, 52500], [25000, 32500, 50000, 75000], [30000, 40000, 60000, 90000],
];

// EMEA partner chart [econ, premEcon, biz, first]
const EMEA_BANDS = [1500, 3500, 5000, 7000, 10000, Infinity];
const EMEA_CHART = [
  [7500, 10000, 15000, 22500], [22500, 30000, 45000, 67500], [27500, 35000, 55000, 82500],
  [35000, 45000, 70000, 105000], [42500, 55000, 85000, 130000], [55000, 72500, 110000, 165000],
];

// Asia-Pacific partner chart [econ, premEcon, biz, first]
const APAC_BANDS = [1500, 3000, 5000, 7000, 10000, Infinity];
const APAC_CHART = [
  [7500, 10000, 15000, 22500], [25000, 32500, 50000, 75000], [30000, 40000, 60000, 90000],
  [37500, 50000, 75000, 110000], [42500, 55000, 85000, 130000], [65000, 85000, 130000, 195000],
];

// Region mapping
const REGION = {
  // Americas
  US: "AM", CA: "AM", MX: "AM", BR: "AM", AR: "AM", CL: "AM", CO: "AM", PE: "AM",
  CU: "AM", DO: "AM", JM: "AM", TT: "AM", BS: "AM", CR: "AM", PA: "AM", GT: "AM",
  // EMEA
  GB: "EMEA", FR: "EMEA", DE: "EMEA", NL: "EMEA", BE: "EMEA", CH: "EMEA", AT: "EMEA",
  IE: "EMEA", DK: "EMEA", SE: "EMEA", NO: "EMEA", FI: "EMEA", IT: "EMEA", ES: "EMEA",
  PT: "EMEA", GR: "EMEA", PL: "EMEA", TR: "EMEA", IS: "EMEA",
  AE: "EMEA", SA: "EMEA", QA: "EMEA", IL: "EMEA", JO: "EMEA", EG: "EMEA", MA: "EMEA",
  ZA: "EMEA", KE: "EMEA", ET: "EMEA",
  // Asia-Pacific
  JP: "APAC", KR: "APAC", CN: "APAC", HK: "APAC", TW: "APAC",
  IN: "APAC", LK: "APAC", MV: "APAC", PK: "APAC", BD: "APAC", NP: "APAC",
  TH: "APAC", SG: "APAC", MY: "APAC", ID: "APAC", PH: "APAC", VN: "APAC",
  AU: "APAC", NZ: "APAC", FJ: "APAC",
};

function getRegion(cc1, cc2) {
  const r1 = REGION[cc1] || "AM";
  const r2 = REGION[cc2] || "AM";
  if (r1 === "APAC" || r2 === "APAC") return "APAC";
  if (r1 === "EMEA" || r2 === "EMEA") return "EMEA";
  return "AM";
}

export const slug = "atmos-rewards";

export const bookable = BOOKABLE;

export function handle(legs, totalDistance) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);

  // Own-metal
  if (carriers.length > 0 && carriers.every((c) => OWN_CARRIERS.has(c))) {
    const idx = resolveBand(totalDistance, OWN_BANDS);
    const [e, f] = OWN_CHART[idx];
    return [makeEntry("atmos", "own", "default", e, null, null, f)];
  }

  // Partner — select regional chart
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const region = getRegion(originCC, destCC);

  let bands, chart;
  if (region === "APAC") { bands = APAC_BANDS; chart = APAC_CHART; }
  else if (region === "EMEA") { bands = EMEA_BANDS; chart = EMEA_CHART; }
  else { bands = AM_BANDS; chart = AM_CHART; }

  const idx = resolveBand(totalDistance, bands);
  const [e, pe, b, f] = chart[idx];
  return [makeEntry("atmos", "partner", "default", e, pe, b, f)];
}
