/**
 * Cedar Miles (Middle East Airlines) — Zone-based chart
 *
 * MEA own-metal: 10-zone system centred on Beirut. Limited published rates.
 * SkyTeam partner: separate chart (higher rates). Qatar Airways: separate chart.
 * Only known rate: Zone 5 (London/Europe) from Beirut.
 *
 * Source: vault Award Charts/Cedar Miles.md
 * HOW TO REFRESH: Update zone maps and charts when full matrix is published
 */

import { resolveChart, pairKey } from "../../shared.js";

// SkyTeam members minus OK (Czech Airlines ceased operations)
// Plus QR (Qatar Airways — non-alliance partner with own chart)
const BOOKABLE = new Set(["AF","AM","AR","CI","DL","GA","KE","KL","KQ","ME","MF","MU","QR","RO","SV","UX","VN","VS"]);

const ME_CARRIERS = new Set(["ME"]);

// 10-zone mapping centred on Beirut
const ZONE = {
  LB: 1,
  BH: 2, IR: 2, IQ: 2, KZ: 2, KG: 2, KW: 2, OM: 2, QA: 2,
  SA: 2, AE: 2, UZ: 2, YE: 2,
  AM: 3, AZ: 3, CY: 3, EG: 3, GE: 3, JO: 3, SY: 3, TR: 3,
  // Zone 4: Sub-Saharan Africa
  AO: 4, CM: 4, CD: 4, ET: 4, GH: 4, KE: 4, MG: 4, MU: 4,
  MA: 4, NG: 4, SN: 4, ZA: 4, TZ: 4, TN: 4, UG: 4,
  // Zone 5: Europe
  AL: 5, AT: 5, BE: 5, DK: 5, FI: 5, FR: 5, DE: 5, GB: 5,
  GR: 5, HU: 5, IE: 5, IT: 5, NL: 5, NO: 5, PL: 5, PT: 5,
  RO: 5, RU: 5, ES: 5, SE: 5, CH: 5, UA: 5,
  // Zone 6: India
  IN: 6,
  // Zone 7: East & Southeast Asia
  CN: 7, JP: 7, KR: 7, MN: 7, KH: 7, HK: 7, ID: 7,
  MY: 7, NP: 7, PH: 7, SG: 7, LK: 7, TW: 7, TH: 7, VN: 7,
  // Zone 8: USA, Canada
  US: 8, CA: 8,
  // Zone 9: Alaska, Mexico, Central America, South America, Caribbean
  MX: 9, GT: 9, HN: 9, SV: 9, NI: 9, CR: 9, PA: 9,
  BR: 9, AR: 9, CL: 9, CO: 9, PE: 9, VE: 9, EC: 9,
  CU: 9, DO: 9, JM: 9, BS: 9, BB: 9, TT: 9,
  // Zone 10: Australasia
  AU: 10, NZ: 10, FJ: 10,
};

const AK_AIRPORTS = new Set(["ANC","FAI","JNU"]);

function getZone(cc, airport) {
  if (cc === "US" && AK_AIRPORTS.has(airport)) return 9;
  return ZONE[cc] || null;
}

// MEA own-metal chart — round-trip from Beirut (Zone 1)
// Only Zone 5 (Europe) rates are published
// [economy_rt, business_rt]
const MEA_OWN = {
  5: [35000, 70000],
};

export const slug = "cedar-miles";

export const bookable = BOOKABLE;

export function handle(legs) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, ME_CARRIERS);
  const entries = [];

  const oz = getZone(originCC, legs[0].origin);
  const dz = getZone(destCC, legs[legs.length - 1].destination);
  if (oz === null || dz === null) return [];

  // Cedar Miles is centred on Beirut — one end should be Zone 1 (Lebanon)
  const isLBOrigin = oz === 1;
  const isLBDest = dz === 1;

  // MEA own-metal
  if (chart !== "partner" && (isLBOrigin || isLBDest)) {
    const foreignZone = isLBOrigin ? dz : oz;
    const ownRow = MEA_OWN[foreignZone];

    if (ownRow) {
      const [e_rt, b_rt] = ownRow;
      // One-way = half round-trip
      entries.push({
        programme: "cedarmiles", chart: "own", season: "default",
        economy: [e_rt / 2, e_rt / 2], premium_economy: null,
        business: [b_rt / 2, b_rt / 2], first: null,
      });
    }
  }

  // SkyTeam partner and QR charts — no published zone-to-zone matrix in vault
  // Cannot compute pricing, so return nothing for partner

  return entries;
}
