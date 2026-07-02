import { makeEntry, pairKey } from "../../shared.js";

const BOOKABLE = new Set(["A3","AC","AD","AI","AV","AZ","BR","BT","CA","CM","CX","EK","EN","ET","EW","EY","FZ","G3","GF","HO","JU","LH","LO","LX","MK","MO","MS","NH","NZ","OA","OS","OU","OZ","PB","SA","SN","SQ","TG","TK","TP","UA","VA","VL","WY","XQ","ZH","4Y","5T"]);

// Select Partners (dynamic pricing above the published Start table). MO/5T/PB
// (Calm Air, Canadian North, PAL) per Air Canada's March-2025 Select Partners
// announcement.
const DYNAMIC_PARTNERS = new Set(["AC","UA","EK","EY","FZ","MO","5T","PB"]);

// Zone assignments by country code
const ZONE = {
  // North America
  US: "NA", CA: "NA", MX: "NA",
  // Caribbean & Central America
  CU: "NA", DO: "NA", HT: "NA", JM: "NA", BS: "NA", BB: "NA", TT: "NA",
  AG: "NA", LC: "NA", VC: "NA", GD: "NA", DM: "NA", KN: "NA", PR: "NA",
  AW: "NA", CW: "NA", VI: "NA", KY: "NA", BM: "NA", TC: "NA",
  GT: "NA", HN: "NA", SV: "NA", NI: "NA", CR: "NA", PA: "NA", BZ: "NA",
  // South America
  BR: "SA", AR: "SA", CL: "SA", CO: "SA", PE: "SA", VE: "SA", EC: "SA",
  BO: "SA", PY: "SA", UY: "SA", GY: "SA", SR: "SA", GF: "SA",
  // Atlantic (Europe)
  GB: "AT", FR: "AT", DE: "AT", NL: "AT", BE: "AT", CH: "AT", AT: "AT",
  IE: "AT", DK: "AT", SE: "AT", NO: "AT", FI: "AT", LU: "AT", IS: "AT",
  IT: "AT", ES: "AT", PT: "AT", GR: "AT", PL: "AT", RO: "AT", BG: "AT",
  CZ: "AT", HU: "AT", HR: "AT", RS: "AT", SK: "AT", SI: "AT", BA: "AT",
  ME: "AT", MK: "AT", AL: "AT", XK: "AT", LT: "AT", LV: "AT", EE: "AT",
  CY: "AT", MT: "AT", MD: "AT", UA: "AT", BY: "AT", GE: "AT", AM: "AT",
  AZ: "AT", RU: "AT", TR: "AT",
  // Atlantic (Middle East)
  AE: "AT", SA: "AT", QA: "AT", BH: "AT", KW: "AT", OM: "AT", JO: "AT",
  LB: "AT", IQ: "AT", IR: "AT", IL: "AT", PS: "AT", YE: "AT", SY: "AT",
  // Atlantic (Africa)
  MA: "AT", TN: "AT", DZ: "AT", LY: "AT", EG: "AT",
  NG: "AT", GH: "AT", SN: "AT", CI: "AT", CM: "AT", ZA: "AT", KE: "AT",
  TZ: "AT", ET: "AT", MZ: "AT", ZW: "AT", ZM: "AT", UG: "AT", RW: "AT",
  MG: "AT", MU: "AT", SC: "AT", DJ: "AT", SD: "AT", SS: "AT", SO: "AT",
  ER: "AT", AO: "AT", CD: "AT", CG: "AT", GA: "AT", TD: "AT", CF: "AT",
  BW: "AT", NA: "AT", MW: "AT", SZ: "AT", LS: "AT", BI: "AT", RE: "AT",
  KM: "AT", ML: "AT", BF: "AT", NE: "AT", GN: "AT", BJ: "AT", TG: "AT",
  MR: "AT", SL: "AT", LR: "AT", GW: "AT", GM: "AT", CV: "AT", GQ: "AT",
  ST: "AT",
  // Atlantic (Indian Subcontinent)
  IN: "AT", PK: "AT", BD: "AT", LK: "AT", NP: "AT", MV: "AT", AF: "AT",
  // Central Asia (Atlantic zone for Aeroplan)
  KZ: "AT", UZ: "AT", TM: "AT", KG: "AT", TJ: "AT", MN: "AT",
  // Pacific (East Asia)
  CN: "PA", HK: "PA", TW: "PA", JP: "PA", KR: "PA", MO: "PA",
  // Pacific (Southeast Asia)
  TH: "PA", SG: "PA", MY: "PA", ID: "PA", PH: "PA", VN: "PA",
  MM: "PA", KH: "PA", LA: "PA", BN: "PA", TL: "PA",
  // Pacific (Oceania)
  AU: "PA", NZ: "PA", FJ: "PA", PG: "PA", WS: "PA", TO: "PA",
  VU: "PA", SB: "PA", NC: "PA", PF: "PA", GU: "PA",
};

// Fixed partner chart: key = "ZONE1|ZONE2" (sorted), value = array of [maxDist, econ, biz, first]
// Effective 2026-06-01 (Aeroplan partner award chart revaluation). Bands/zones
// unchanged from the prior chart; only point values moved. NA|NA, SA|SA, NA|SA,
// AT|SA, PA|SA were unaffected by the revaluation.
const CHARTS = {
  "NA|NA": [
    [500, 6000, 15000, null],
    [1500, 10000, 20000, null],
    [2750, 12500, 25000, null],
    [Infinity, 22500, 35000, null],
  ],
  "AT|NA": [
    [4000, 32500, 60000, 90000],
    [6000, 42500, 75000, 120000],
    [8000, 60000, 90000, 150000],
    [Infinity, 75000, 110000, 165000],
  ],
  "NA|PA": [
    [5000, 32500, 55000, 90000],
    [7500, 50000, 85000, 120000],
    [11000, 65000, 102500, 140000],
    [Infinity, 70000, 115000, 150000],
  ],
  "NA|SA": [
    [2500, 20000, 40000, 60000],
    [4500, 30000, 50000, 80000],
    [Infinity, 40000, 60000, 100000],
  ],
  "AT|AT": [
    [1000, 7500, 12500, 25000],
    [2000, 15000, 22500, 40000],
    [4000, 30000, 40000, 75000],
    [6000, 42500, 70000, 100000],
    [Infinity, 50000, 95000, 130000],
  ],
  "PA|PA": [
    [1000, 8000, 20000, 25000],
    [2000, 15000, 30000, 50000],
    [5000, 30000, 52500, 60000],
    [7000, 35000, 72500, 80000],
    [Infinity, 50000, 85000, 130000],
  ],
  "AT|PA": [
    [2500, 25000, 47500, 55000],
    [5000, 40000, 75000, 95000],
    [7000, 60000, 92500, 120000],
    [Infinity, 75000, 130000, 150000],
  ],
  "SA|SA": [
    [1600, 10000, 20000, 30000],
    [Infinity, 20000, 35000, 50000],
  ],
  "AT|SA": [
    [7000, 45000, 80000, 100000],
    [Infinity, 60000, 100000, 130000],
  ],
  "PA|SA": [
    [11000, 60000, 90000, 130000],
    [Infinity, 80000, 140000, 200000],
  ],
};

// "Select Partners" published Start (minimum) prices — a SEPARATE table from the
// fixed partner chart, with a Premium Economy column the fixed chart lacks.
// Only the four NA-anchored zone pairs are published. Values = the pre-June-2026
// published table with the June 1 2026 revaluation deltas applied (web-verified:
// Milesopedia + Upgraded Points; within-NA 2,751+ Y Start 17,500 also confirmed
// by live observation, which occasionally dips ~8% BELOW Start in saver troughs —
// Start is a published minimum, not a hard floor).
// [maxDist, econ, prem_econ, biz, first]
const SELECT_START = {
  "NA|NA": [
    [500, 6000, 10000, 15000, null],
    [1500, 10000, 15000, 20000, null],
    [2750, 12500, 20000, 25000, null],
    [Infinity, 17500, 30000, 35000, null],
  ],
  "AT|NA": [
    [4000, 32500, 50000, 60000, 90000],
    [6000, 42500, 60000, 75000, 100000],
    [8000, 55000, 70000, 90000, 120000],
    [Infinity, 70000, 85000, 110000, 130000],
  ],
  "NA|PA": [
    [5000, 32500, 45000, 55000, 90000],
    [7500, 45000, 60000, 85000, 110000],
    [11000, 50000, 85000, 85000, 130000],
    [Infinity, 70000, 95000, 105000, 150000],
  ],
  "NA|SA": [
    [2500, 20000, 35000, 40000, 60000],
    [4500, 30000, 45000, 50000, 80000],
    [Infinity, 40000, 55000, 60000, 100000],
  ],
};

export const slug = "aeroplan";

export const bookable = BOOKABLE;

export function handle(legs, totalDistance) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);

  // Single-pass carrier classification
  let hasDynamic = false, hasFixed = false;
  for (const c of carriers) {
    if (DYNAMIC_PARTNERS.has(c)) hasDynamic = true;
    else hasFixed = true;
    if (hasDynamic && hasFixed) break;
  }

  // Mixed dynamic + fixed carriers can't be priced on a single chart.
  if (hasDynamic && hasFixed) return [];

  const originZone = ZONE[legs[0].origin_cc];
  const destZone = ZONE[legs[legs.length - 1].destination_cc];
  const chart = originZone && destZone ? CHARTS[pairKey(originZone, destZone)] : null;
  const row = chart ? chart.find((band) => totalDistance <= band[0]) : null;

  if (hasDynamic) {
    // AC own metal + "Select Partners" (UA/EK/EY/FZ): dynamic pricing ABOVE the
    // published Start price, no published ceiling. Emit the Start as a floor with
    // `floor: true` so the tier model reads {from, to:null}. Starts are published
    // only for NA-anchored pairs — elsewhere fall back to the fixed-chart values
    // as an approximate floor, or fully dynamic when the zone can't be resolved.
    const startChart = originZone && destZone ? SELECT_START[pairKey(originZone, destZone)] : null;
    const startRow = startChart ? startChart.find((band) => totalDistance <= band[0]) : null;
    if (startRow) {
      const [, econ, pe, biz, first] = startRow;
      return [{
        programme: "aeroplan", chart: "dynamic", season: "default", floor: true,
        economy: [econ, econ], premium_economy: pe ? [pe, pe] : null,
        business: [biz, biz], first: first ? [first, first] : null,
      }];
    }
    if (!row) return [makeEntry("aeroplan", "dynamic", "default", 0, null, 0, null)];
    const [, econ, biz, first] = row;
    return [{
      programme: "aeroplan", chart: "dynamic", season: "default", floor: true,
      economy: [econ, econ], premium_economy: null,
      business: [biz, biz], first: first ? [first, first] : null,
    }];
  }

  // Fixed partner chart. (No Premium Economy column BY DESIGN — Aeroplan does not
  // sell PE on fixed-chart partners; PE exists only on the Select Partners chart.)
  if (!row) return [];
  const [, econ, biz, first] = row;
  return [makeEntry("aeroplan", "partner", "default", econ, null, biz, first)];
}
