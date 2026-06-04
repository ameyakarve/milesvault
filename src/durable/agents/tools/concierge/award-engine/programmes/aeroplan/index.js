import { makeEntry, pairKey } from "../../shared.js";

const BOOKABLE = new Set(["A3","AC","AD","AI","AV","AZ","BR","BT","CA","CM","CX","EK","EN","ET","EW","EY","FZ","G3","GF","HO","JU","LH","LO","LX","MK","MS","NH","NZ","OA","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VA","VL","WY","XQ","ZH","4Y"]);

// Select Partners use dynamic pricing — return [0,0]
const DYNAMIC_PARTNERS = new Set(["AC","UA","EK","EY","FZ"]);

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
const CHARTS = {
  "NA|NA": [
    [500, 6000, 15000, null],
    [1500, 10000, 20000, null],
    [2750, 12500, 25000, null],
    [Infinity, 22500, 35000, null],
  ],
  "AT|NA": [
    [4000, 35000, 60000, 90000],
    [6000, 40000, 70000, 100000],
    [8000, 55000, 90000, 130000],
    [Infinity, 70000, 110000, 140000],
  ],
  "NA|PA": [
    [5000, 35000, 55000, 90000],
    [7500, 50000, 75000, 110000],
    [11000, 60000, 87500, 130000],
    [Infinity, 75000, 115000, 150000],
  ],
  "NA|SA": [
    [2500, 20000, 40000, 60000],
    [4500, 30000, 50000, 80000],
    [Infinity, 40000, 60000, 100000],
  ],
  "AT|AT": [
    [1000, 7500, 15000, 25000],
    [2000, 12500, 25000, 40000],
    [4000, 25000, 45000, 65000],
    [6000, 35500, 60000, 90000],
    [Infinity, 50000, 80000, 130000],
  ],
  "PA|PA": [
    [1000, 8000, 20000, 25000],
    [2000, 12500, 30000, 50000],
    [5000, 25000, 45000, 60000],
    [7000, 37500, 60000, 80000],
    [Infinity, 55000, 90000, 130000],
  ],
  "AT|PA": [
    [2500, 25000, 40000, 50000],
    [5000, 40000, 60000, 80000],
    [7000, 50000, 80000, 100000],
    [Infinity, 65000, 110000, 140000],
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

  if (hasDynamic && !hasFixed) {
    return [makeEntry("aeroplan", "dynamic", "default", 0, null, 0, null)];
  }
  if (hasDynamic && hasFixed) return [];

  const originZone = ZONE[legs[0].origin_cc];
  const destZone = ZONE[legs[legs.length - 1].destination_cc];
  if (!originZone || !destZone) return [];

  const chart = CHARTS[pairKey(originZone, destZone)];
  if (!chart) return [];

  const row = chart.find((band) => totalDistance <= band[0]);
  const [, econ, biz, first] = row;
  return [makeEntry("aeroplan", "partner", "default", econ, null, biz, first)];
}
