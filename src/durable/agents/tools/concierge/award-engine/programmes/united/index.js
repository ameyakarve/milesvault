/**
 * United MileagePlus — Dynamic pricing with observed saver floors
 *
 * Returns [own_floor, partner_floor] as min/max range per zone pair.
 * Own-metal floors are ~10% lower than partner floors.
 *
 * Source: vault Award Charts/United MileagePlus.md, Upgraded Points (Jan 2026)
 * HOW TO REFRESH: Update FLOORS below with new observed minimums
 *
 * TODO: FLOORS_NONUS is stale and disagrees with Seats.aero full-year data (Mar 2026).
 * Reverse-engineer proper non-US zone pairs from Seats.aero sources=united queries.
 * Known discrepancies (code value → Seats.aero actual, full year, flat pricing):
 *   CSA|EU:  33K/60.5K  → 55K/110K/165K  (all EU destinations from DEL)
 *   AF|CSA:  45K/88K    → 55K/110K/165K  (NBO, CAI from DEL)
 *   CSA|ME:  30K/55K    → 40K/75K        (DXB from DEL)
 *   CSA|SEA: 22.5K/45K  → varies: BKK/HKG 22.5K/65K, SIN-DEL 35K/90K, SIN-BOM 22.5K/65K
 *                          Business floor is 65K not 45K for most SEA; SIN from DEL is a separate tier
 *   First class: CSA→US = 220K WIRED (Air India, flat, verified). Still to verify+add
 *     (prior obs, unconfirmed by the distribution method): 165K (EU/AF), 140K (OC),
 *     110K (SIN-DEL), 75K (SIN-BOM, BKK-BOM) — run sources=united per band before adding.
 * United likely uses distance bands within zones, not pure zone-pair pricing for non-US origins.
 * Build a systematic Seats.aero scrape across all India origins × all destinations to map the real tiers.
 */

import { makeEntry } from "../../shared.js";

const BOOKABLE = new Set(["3M","9K","A3","AC","AD","AI","AV","BR","CA","CM","EI","EN","ET","EW","HA","LH","LO","LX","MS","NH","NZ","OA","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VA","ZH"]);

const UA_CARRIERS = new Set(["UA"]);

const ZONE = {
  US: "US", CA: "US",
  MX: "MX",
  CU: "CB", DO: "CB", JM: "CB", BS: "CB", BB: "CB", TT: "CB", PR: "CB",
  GT: "CA", HN: "CA", SV: "CA", NI: "CA", CR: "CA", PA: "CA", BZ: "CA",
  CO: "SA1", EC: "SA1", PE: "SA1", VE: "SA1", BO: "SA1",
  BR: "SA2", AR: "SA2", CL: "SA2", PY: "SA2", UY: "SA2",
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU", AT: "EU",
  IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU", IT: "EU", ES: "EU",
  PT: "EU", GR: "EU", PL: "EU", TR: "EU", IS: "EU", RU: "EU",
  CZ: "EU", HU: "EU", RO: "EU", BG: "EU", HR: "EU", RS: "EU",
  MA: "NAF", TN: "NAF", DZ: "NAF",
  ZA: "AF", KE: "AF", TZ: "AF", ET: "AF", NG: "AF", GH: "AF",
  AE: "ME", SA: "ME", QA: "ME", BH: "ME", KW: "ME", OM: "ME",
  IL: "ME", EG: "ME", JO: "ME",
  IN: "CSA", PK: "CSA", BD: "CSA", LK: "CSA", NP: "CSA", MV: "CSA", KZ: "CSA",
  CN: "NA2", KR: "NA2", TW: "NA2", MN: "NA2",
  JP: "JP",
  HK: "SEA", SG: "SEA", TH: "SEA", MY: "SEA", ID: "SEA", PH: "SEA", VN: "SEA",
  KH: "SEA", MM: "SEA",
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

// Observed saver floors: [own_econ_min, own_econ_max, own_biz, partner_econ, partner_biz, partner_first?]
// partner_first is optional (6th element) — present only where a partner sells
// first on the route (UA own metal has no international first). null when absent.
// FROM US to each zone
const FLOORS_US = {
  US:  [5000, 17500, 25000, 12500, 25000],
  AK:  [10000, 17500, 30000, 17500, 45000],
  HI:  [10000, 25000, 50000, 22500, 55000],
  MX:  [10000, 17500, 30000, 17500, 38500],
  CB:  [10000, 17500, 30000, 14300, 38500],
  CA:  [17500, 22000, 40000, 20000, 38500],
  SA1: [20000, 30000, 55000, 26300, 60500],
  SA2: [30000, 40000, 80000, 49500, 88000],
  EU:  [30000, 40000, 80000, 32000, 88000],
  ME:  [35000, 45000, 80000, 44000, 88000],
  NAF: [35000, 45000, 80000, 45000, 88000],
  AF:  [40000, 50000, 88000, 49500, 88000],
  CSA: [40000, 55000, 88000, 49500, 88000, 220000], // partner first: Air India DEL/BOM–US, flat 220K (verified sources=united, full 2mo)
  NA2: [40000, 55000, 100000, 60500, 110000],
  JP:  [40000, 55000, 100000, 60500, 110000],
  SEA: [40000, 55000, 100000, 60500, 110000],
  OC:  [37500, 55000, 100000, 60000, 110000],
};

// Non-US origin partner floors (from FlyerTalk, AwardFares, Upgraded Points)
// key = "ZONE1|ZONE2" (sorted), value = [partner_econ, partner_biz]
const FLOORS_NONUS = {
  "CSA|JP": [35000, 90000],   // DEL-NRT confirmed via Seats.aero
  "CSA|NA2": [35000, 90000],  // India-North Asia
  "CSA|SEA": [22500, 45000],  // India-SEA (22.5K Y confirmed; 45K J min CCU-BKK, 65K BOM/DEL-BKK, 90K DEL-SIN)
  "CSA|EU": [33000, 60500],   // India-Europe (FlyerTalk: 71.5K for F on LH)
  "EU|JP": [60000, 140000],   // Europe-Japan
  "EU|SEA": [60000, 140000],  // Europe-SEA
  "EU|NA2": [60000, 140000],  // Europe-North Asia
  "JP|SEA": [35000, 70000],   // Japan-SEA (AwardFares: NRT-SIN 35K/70K)
  "NA2|SEA": [20000, 45000],  // Intra-Asia (Korea/China-SEA)
  "JP|NA2": [12500, 45000],   // Japan-Korea/China (12.5K Y, 45K J confirmed full year Seats.aero Mar 2026)
  "EU|EU": [17500, 35000],    // Intra-Europe
  "CSA|ME": [30000, 55000],   // India-Middle East
  "CSA|OC": [50000, 110000],  // India-Oceania (50K econ confirmed Seats.aero Mar 2026)
  "AF|CSA": [45000, 88000],   // India-Africa
  "CSA|SA2": [50000, 100000], // India-South America
  "EU|ME": [30000, 55000],    // Europe-Middle East
  "AF|EU": [40000, 80000],    // Europe-Africa
  "EU|OC": [60000, 140000],   // Europe-Oceania
  "JP|OC": [50000, 100000],   // Japan-Oceania
};

export const slug = "united-mileageplus";

export const bookable = BOOKABLE;

function pairKey(a, b) { return a <= b ? `${a}|${b}` : `${b}|${a}`; }

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;

  const oz = getZone(originCC, legs[0].origin);
  const dz = getZone(destCC, legs[legs.length - 1].destination);
  if (!oz || !dz) return [];

  const isOwn = carriers.length > 0 && carriers.every((c) => UA_CARRIERS.has(c));
  const touchesUS = oz === "US" || dz === "US";

  if (touchesUS) {
    // US-origin pricing
    const zone = oz === "US" ? dz : oz;
    const floor = FLOORS_US[zone];
    if (!floor) return [];
    const [ownEMin, ownEMax, ownBiz, ptrEcon, ptrBiz, ptrFirst] = floor;

    if (isOwn) {
      // UA own metal has no international first cabin.
      return [{
        programme: "united", chart: "saver_floor", season: "default",
        economy: [ownEMin, ownEMax],
        premium_economy: null,
        business: [ownBiz, ownBiz],
        first: null,
      }];
    }
    return [{
      programme: "united", chart: "partner_floor", season: "default",
      economy: [ptrEcon, ptrEcon],
      premium_economy: null,
      business: [ptrBiz, ptrBiz],
      first: ptrFirst ? [ptrFirst, ptrFirst] : null,
    }];
  }

  // Non-US origin — use cross-region partner floors
  const key = pairKey(oz, dz);
  const nonUS = FLOORS_NONUS[key];
  if (nonUS) {
    // [partner_econ, partner_biz, partner_first?] — first optional (3rd),
    // filled per band as it's verified from sources=united data.
    const [e, b, f] = nonUS;
    return [{
      programme: "united", chart: "partner_floor", season: "default",
      economy: [e, e],
      premium_economy: null,
      business: [b, b],
      first: f ? [f, f] : null,
    }];
  }

  // Unknown non-US pair
  return [{ programme: "united", chart: "dynamic", season: "default",
    economy: [0, 0], premium_economy: null, business: [0, 0], first: null }];
}
