/**
 * Delta SkyMiles — Dynamic pricing with observed minimums
 *
 * Returns [minimum, average] as range. No guaranteed pricing.
 * Minimums from AwardWallet tracking data (Sept 2023, verified Jan 2026).
 *
 * Source: vault Award Charts/Delta SkyMiles.md, AwardWallet unofficial chart
 * HOW TO REFRESH: Update FLOORS below with new observed minimums from AwardWallet
 */

import { makeEntry } from "../../shared.js";

const BOOKABLE = new Set(["9K","AF","AM","AR","CI","CZ","DL","GA","HA","KE","KL","KQ","LA","ME","MF","MU","RO","SV","TN","UX","VN","VS","WS"]);

const DL_CARRIERS = new Set(["DL"]);

const ZONE = {
  US: "US", CA: "US", MX: "US",
  CU: "CB", DO: "CB", JM: "CB", BS: "CB", BB: "CB", TT: "CB", PR: "CB",
  GT: "CA", HN: "CA", SV: "CA", NI: "CA", CR: "CA", PA: "CA", BZ: "CA",
  CO: "NSA", EC: "NSA", PE: "NSA", VE: "NSA", BO: "NSA",
  BR: "SSA", AR: "SSA", CL: "SSA", PY: "SSA", UY: "SSA",
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU", AT: "EU",
  IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU", IT: "EU", ES: "EU",
  PT: "EU", GR: "EU", PL: "EU", TR: "EU", IS: "EU", RU: "EU", MA: "EU",
  CZ: "EU", HU: "EU", RO: "EU", BG: "EU", HR: "EU",
  AE: "ME", SA: "ME", QA: "ME", BH: "ME", KW: "ME", OM: "ME",
  IL: "ME", EG: "ME", JO: "ME",
  IN: "IS", PK: "IS", BD: "IS", LK: "IS", MV: "IS", NP: "IS",
  JP: "EA", KR: "EA", CN: "EA", HK: "EA", TW: "EA", PH: "EA", GU: "EA",
  TH: "SEA", SG: "SEA", MY: "SEA", ID: "SEA", VN: "SEA", KH: "SEA", MM: "SEA",
  ZA: "AF", KE: "AF", ET: "AF", NG: "AF", GH: "AF", TZ: "AF",
  AU: "OC", NZ: "OC", FJ: "OC",
};

const HI_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO","MKK"]);
const AK_AIRPORTS = new Set(["ANC","FAI","JNU","SIT","KTN"]);

function getZone(cc, airport) {
  if (cc === "US") {
    if (HI_AIRPORTS.has(airport)) return "HI";
    if (AK_AIRPORTS.has(airport)) return "AK";
    return "US";
  }
  return ZONE[cc] || null;
}

// Observed minimums from US [basic_min, main_min, deltaone_min]
// 0 = not available or no data
const FLOORS = {
  US:  [3000, 5500, 63000],
  AK:  [6000, 11500, 0],
  HI:  [7500, 17000, 90000],
  CB:  [5500, 6000, 36000],
  CA:  [6000, 14000, 0],
  NSA: [5000, 25000, 38000],
  SSA: [19000, 35000, 135000],
  EU:  [20000, 37000, 170000],
  ME:  [52000, 58000, 235000],
  IS:  [0, 0, 0],  // No direct DL service — return [0,0]
  EA:  [23000, 25000, 145000],
  SEA: [0, 0, 0],  // Limited data
  AF:  [72000, 78000, 270000],
  OC:  [56000, 50000, 400000],
};

export const slug = "delta-skymiles";

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;

  const oz = getZone(originCC, legs[0].origin);
  const dz = getZone(destCC, legs[legs.length - 1].destination);
  if (!oz || !dz) return [];

  // Floors are bidirectional — use the non-US zone if one end is US
  const zone = oz === "US" ? dz : (dz === "US" ? oz : null);
  if (!zone) {
    // Neither end is US — no data for non-US pairs
    return [{ programme: "delta", chart: "dynamic", season: "default",
      economy: [0, 0], premium_economy: null, business: [0, 0], first: null }];
  }
  const floor = FLOORS[zone];
  if (!floor || (floor[0] === 0 && floor[1] === 0 && floor[2] === 0)) {
    return [{ programme: "delta", chart: "dynamic", season: "default",
      economy: [0, 0], premium_economy: null, business: [0, 0], first: null }];
  }

  const [basic, main, deltaone] = floor;
  if (basic === 0 && main === 0 && deltaone === 0) {
    return [makeEntry("delta", "dynamic", "default", 0, null, 0, null)];
  }

  const wrap = (v) => v === 0 ? null : [v, v];

  return [{
    programme: "delta", chart: "observed_floor", season: "default",
    economy: wrap(main || basic),
    premium_economy: null,
    business: wrap(deltaone),
    first: null,
  }];
}
