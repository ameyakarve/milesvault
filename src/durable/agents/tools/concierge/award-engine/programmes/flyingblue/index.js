/**
 * Flying Blue — Fully dynamic pricing
 *
 * Returns published minimum floor prices by route category.
 * All values are [min, min] since actual pricing is dynamic and unknown.
 * The chart type is "dynamic_floor" to indicate these are minimums, not fixed rates.
 */

const BOOKABLE = new Set(["AF","AM","AR","BT","CI","CM","DL","EY","G3","GA","JL","KE","KL","KQ","LY","ME","MF","MH","MK","MU","PG","QF","RO","SK","SV","UX","VN","VS","WS","WY"]);

// Region assignments for Flying Blue zone pairs
const FB_REGION = {
  // Europe
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU", AT: "EU",
  IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU", LU: "EU", IS: "EU",
  IT: "EU", ES: "EU", PT: "EU", GR: "EU", PL: "EU", RO: "EU", BG: "EU",
  CZ: "EU", HU: "EU", HR: "EU", RS: "EU", SK: "EU", SI: "EU", BA: "EU",
  ME: "EU", MK: "EU", AL: "EU", XK: "EU", LT: "EU", LV: "EU", EE: "EU",
  CY: "EU", MT: "EU", MD: "EU", UA: "EU", BY: "EU", GE: "EU", AM: "EU",
  AZ: "EU", RU: "EU", TR: "EU",
  // North Africa (treated as Europe for FB pricing)
  MA: "NA_AF", TN: "NA_AF", DZ: "NA_AF", LY: "NA_AF",
  EG: "NA_AF",
  // North America
  US: "NAM", CA: "NAM", MX: "NAM",
  // Asia-Pacific
  CN: "AP", HK: "AP", TW: "AP", JP: "AP", KR: "AP", MO: "AP",
  IN: "AP", PK: "AP", BD: "AP", LK: "AP", NP: "AP", MV: "AP",
  TH: "AP", SG: "AP", MY: "AP", ID: "AP", PH: "AP", VN: "AP",
  MM: "AP", KH: "AP", LA: "AP", BN: "AP",
  AU: "AP", NZ: "AP", FJ: "AP",
  // Middle East
  AE: "AP", SA: "AP", QA: "AP", BH: "AP", KW: "AP", OM: "AP",
  JO: "AP", LB: "AP", IQ: "AP", IR: "AP", IL: "AP",
  // Africa (sub-Saharan)
  ZA: "AF", KE: "AF", TZ: "AF", ET: "AF", NG: "AF", GH: "AF",
  SN: "AF", CI: "AF", CM: "AF", MZ: "AF", ZW: "AF", ZM: "AF",
  UG: "AF", RW: "AF", MG: "AF", MU: "AF", SC: "AF",
  // Central & South America
  BR: "CSA", AR: "CSA", CL: "CSA", CO: "CSA", PE: "CSA", VE: "CSA",
  EC: "CSA", BO: "CSA", PY: "CSA", UY: "CSA",
  PA: "CSA", CR: "CSA", GT: "CSA", HN: "CSA", SV: "CSA", NI: "CSA",
  CU: "CSA", DO: "CSA", HT: "CSA", JM: "CSA", TT: "CSA",
  // Caribbean
  BS: "CSA", BB: "CSA", AG: "CSA", LC: "CSA",
};

// Minimum floor prices: key = "REGION1-REGION2" (sorted), value = [economy, premEcon, business]
// Null premEcon where not available
const FLOORS = {
  "EU-EU":     [5000, null, 20000],
  "EU-NA_AF":  [5000, null, 20000],
  "EU-NAM":    [15000, 30000, 55000],
  "AP-EU":     [15000, 30000, 50000],
  "AF-EU":     [20000, 40000, 60000],
  "CSA-EU":    [20500, 40000, 60000],
  "AP-AP":     [5500, null, 20000],
  "AP-NAM":    [15000, 30000, 55000],
  "CSA-CSA":   [5500, null, 20000],
  "NA_AF-NA_AF": [5000, null, 20000],
  // Cross-region pairs not explicitly published — use conservative estimates
  "AF-NAM":    [20000, 40000, 60000],
  "AF-AP":     [20000, 40000, 60000],
  "CSA-NAM":   [15000, 30000, 55000],
  "AF-CSA":    [20000, 40000, 60000],
  "CSA-AP":    [20000, 40000, 60000],
  "AF-NA_AF":  [20000, 40000, 60000],
  "CSA-NA_AF": [20500, 40000, 60000],
  "NAM-NA_AF": [15000, 30000, 55000],
  "NAM-NAM":   [12500, null, 50000],
};

function getRegion(cc) {
  return FB_REGION[cc] || null;
}

function floorKey(r1, r2) {
  return r1 <= r2 ? `${r1}-${r2}` : `${r2}-${r1}`;
}

export const slug = "flying-blue";

export const bookable = BOOKABLE;

export function handle(legs, _totalDistance) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const r1 = getRegion(originCC);
  const r2 = getRegion(destCC);
  if (!r1 || !r2) return [];

  const key = floorKey(r1, r2);
  const floor = FLOORS[key];
  if (!floor) return [];

  const [e, pe, b] = floor;
  const wrap = (v) => v != null ? [v, v] : null;

  return [{
    programme: "flyingblue", chart: "dynamic_floor", season: "default",
    economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: null,
  }];
}
