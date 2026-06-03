/**
 * Club Premier / Aeromexico Rewards — Zone-based chart
 *
 * AM own-metal: zone-based from Mexico with Low and High season.
 *   Classic awards at fixed chart prices. Dynamic Fare awards also exist.
 *   Returns [low, high] ranges.
 *
 * SkyTeam partner: unpublished pricing, phone-only. Limited data points.
 *
 * Source: vault Award Charts/Club Premier.md
 * HOW TO REFRESH: Update zone maps and charts below
 */

import { resolveChart, pairKey } from "../../shared.js";

// SkyTeam members minus OK (Czech Airlines ceased operations)
const BOOKABLE = new Set(["AF","AM","AR","CI","DL","GA","KE","KL","KQ","ME","MF","MU","RO","SK","SV","UX","VN","VS"]);

const AM_CARRIERS = new Set(["AM"]);

// Zone mapping
const ZONE = {
  MX: "MX",
  // North America 2: Canada + JFK, SEA, ORD
  CA: "NAM2",
  // Europe (includes Russia)
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU",
  AT: "EU", IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU",
  IT: "EU", ES: "EU", PT: "EU", GR: "EU", PL: "EU", CZ: "EU",
  HU: "EU", RO: "EU", BG: "EU", HR: "EU", RS: "EU", RU: "EU",
  TR: "EU", SK: "EU", SI: "EU",
  // North Africa
  MA: "NAF", TN: "NAF", EG: "NAF",
  // Middle East
  AE: "MEA", IL: "MEA", JO: "MEA",
  // Northeast Asia
  JP: "NEA", KR: "NEA", CN: "NEA",
  // Southeast Asia
  TH: "SEA", VN: "SEA", ID: "SEA", PH: "SEA",
  // Southwest Asia
  IN: "SWA", PK: "SWA", LK: "SWA",
  // Sub-Saharan Africa
  ZA: "AF", KE: "AF", NG: "AF", ET: "AF",
  // Australia, NZ & South Pacific
  AU: "AUNZ", NZ: "AUNZ", FJ: "AUNZ",
  // Central America & Caribbean
  GT: "CAC", HN: "CAC", SV: "CAC", NI: "CAC", CR: "CAC", PA: "CAC",
  CU: "CAC", DO: "CAC", JM: "CAC", BS: "CAC", BB: "CAC", TT: "CAC",
  BZ: "CAC",
  // North of South America
  CO: "NSAM", VE: "NSAM", EC: "NSAM", PE: "NSAM",
  // South of South America
  AR: "SSAM", BR: "SSAM", CL: "SSAM", UY: "SSAM", PY: "SSAM",
};

const HI_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO"]);
// NAM2 airports within the US (JFK, SEA, ORD are NAM2)
const NAM2_US_AIRPORTS = new Set(["JFK","SEA","ORD"]);

function getZone(cc, airport) {
  if (cc === "US") {
    if (HI_AIRPORTS.has(airport)) return "HI";
    if (NAM2_US_AIRPORTS.has(airport)) return "NAM2";
    return "NAM1";
  }
  return ZONE[cc] || null;
}

// Classic award chart — one-way from Mexico
// [ecoLow, ecoHigh, bizLow, bizHigh]
const AM_FROM_MX = {
  MX:   [10000, 14000, 23000, 28000],
  NAM1: [18000, 22000, 36000, 43000],
  NAM2: [30000, 39000, 52000, 72000],
  CAC:  [30000, 39000, 70000, 91000],
  NSAM: [30000, 39000, 70000, 91000],
  SSAM: [50000, 66000, 100000, 130000],
  HI:   [34000, 41000, 76000, 89000],
  EU:   [75000, 90000, 150000, 180000],
  NAF:  [93000, 114000, 202000, 243000],
  MEA:  [93000, 114000, 202000, 243000],
  NEA:  [80000, 110000, 230000, 326000],
  SEA:  [80000, 110000, 230000, 326000],
  SWA:  [115000, 145000, 312000, 409000],
  AF:   [120000, 143000, 257000, 303000],
  AUNZ: [128000, 283000, 148000, 326000],
};

export const bookable = BOOKABLE;

export function handle(legs) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, AM_CARRIERS);
  const entries = [];

  // AM own-metal — chart applies only to routes to/from Mexico
  if (chart !== "partner") {
    const isMXOrigin = originCC === "MX";
    const isMXDest = destCC === "MX";

    if (isMXOrigin || isMXDest) {
      // Domestic
      if (isMXOrigin && isMXDest) {
        const [el, eh, bl, bh] = AM_FROM_MX["MX"];
        entries.push({
          programme: "clubpremier", chart: "classic", season: "default",
          economy: [el, eh], premium_economy: null,
          business: [bl, bh], first: null,
        });
      } else {
        const foreignCC = isMXOrigin ? destCC : originCC;
        const foreignApt = isMXOrigin ? legs[legs.length - 1].destination : legs[0].origin;
        const zone = getZone(foreignCC, foreignApt);

        if (zone && AM_FROM_MX[zone]) {
          const [el, eh, bl, bh] = AM_FROM_MX[zone];
          entries.push({
            programme: "clubpremier", chart: "classic", season: "default",
            economy: [el, eh], premium_economy: null,
            business: [bl, bh], first: null,
          });
        }
      }
    }
  }

  // SkyTeam partner chart — unpublished pricing, phone-only
  // Cannot compute, so return nothing for partner

  return entries;
}
