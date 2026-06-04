/**
 * Miles & More (Lufthansa Group)
 *
 * - LH/LX/OS/VL own-metal: dynamic pricing (return [0,0])
 * - Partner (Star Alliance + Brussels/Discover): fixed zone-based chart, round-trip halved
 *
 * Source: vault Award Charts/Miles & More/Miles & More Partner Chart.md
 * HOW TO REFRESH: Update CHARTS below from miles-and-more.com
 */

import { pairKey } from "../../shared.js";

const BOOKABLE = new Set(["4Y","A3","AC","AI","AV","AZ","BR","CA","CM","CX","EN","ET","EW","LA","LH","LO","LX","MS","NH","NZ","OA","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VL","ZH"]);

const LH_GROUP = new Set(["LH","LX","OS","VL"]);

const ZONE = {
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU", AT: "EU",
  IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU", IT: "EU", ES: "EU",
  PT: "EU", GR: "EU", PL: "EU", CZ: "EU", HU: "EU", RO: "EU", BG: "EU",
  HR: "EU", RS: "EU", SK: "EU", SI: "EU", TR: "EU", RU: "EU", IS: "EU",
  LT: "EU", LV: "EU", EE: "EU",
  US: "NAM", CA: "NAM",
  MX: "CAM", CU: "CAM", DO: "CAM", JM: "CAM", BS: "CAM", BB: "CAM",
  TT: "CAM", PR: "CAM", GT: "CAM", HN: "CAM", SV: "CAM", NI: "CAM",
  CR: "CAM", PA: "CAM", BZ: "CAM",
  BR: "SAM", AR: "SAM", CL: "SAM", CO: "SAM", PE: "SAM", EC: "SAM",
  BO: "SAM", PY: "SAM", UY: "SAM", VE: "SAM",
  AE: "ME", SA: "ME", QA: "ME", BH: "ME", KW: "ME", OM: "ME",
  IL: "ME", JO: "ME", EG: "ME", MA: "ME", TN: "ME", DZ: "ME",
  LB: "ME", IQ: "ME", IR: "ME", GE: "ME", AM: "ME", AZ: "ME",
  KE: "ME", ET: "ME", NG: "ME", GH: "ME", SN: "ME",
  ZA: "SAF", NA: "SAF", BW: "SAF", ZW: "SAF", ZM: "SAF", MZ: "SAF",
  MG: "SAF", MU: "SAF", SC: "SAF",
  IN: "IN", PK: "IN", BD: "IN", LK: "IN", NP: "IN", MV: "IN", AF: "IN",
  TH: "SEA", SG: "SEA", MY: "SEA", ID: "SEA", PH: "SEA", VN: "SEA",
  KH: "SEA", MM: "SEA", LA: "SEA", BN: "SEA",
  CN: "FE", HK: "FE", TW: "FE", JP: "FE", KR: "FE", MN: "FE",
  KZ: "FE", UZ: "FE", KG: "FE", TJ: "FE", TM: "FE",
  AU: "OC", NZ: "OC", FJ: "OC", PG: "OC",
};

const HI_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO","MKK"]);

function getZone(cc, airport) {
  if (cc === "US" && HI_AIRPORTS.has(airport)) return "HI";
  return ZONE[cc] || null;
}

// Partner chart: round-trip values. Key = pairKey(z1,z2). [econ, biz, first]
const C = {};
function a(z1, z2, e, b, f) { C[pairKey(z1, z2)] = [e, b, f]; }

// Europe origin
a("EU","EU", 28000, 50000, 50000);
a("EU","NAM", 50000, 125000, 215000);
a("EU","HI", 95000, 215000, 330000);
a("CAM","EU", 70000, 140000, 225000);
a("EU","SAM", 75000, 150000, 245000);
a("EU","ME", 42000, 75000, 140000);
a("EU","SAF", 50000, 125000, 215000);
a("EU","IN", 50000, 125000, 215000);
a("EU","SEA", 85000, 200000, 240000);
a("EU","FE", 75000, 170000, 260000);
a("EU","OC", 110000, 260000, 395000);
// North America
a("NAM","NAM", 35000, 60000, 80000);
a("HI","NAM", 45000, 75000, 135000);
a("CAM","NAM", 35000, 60000, 90000);
a("NAM","SAM", 50000, 125000, 215000);
a("ME","NAM", 75000, 150000, 240000);
a("NAM","SAF", 95000, 215000, 330000);
a("IN","NAM", 95000, 215000, 330000);
a("NAM","SEA", 75000, 170000, 240000);
a("FE","NAM", 75000, 170000, 240000);
a("NAM","OC", 85000, 160000, 240000);
// Americas inter
a("CAM","CAM", 35000, 60000, 80000);
a("CAM","SAM", 35000, 60000, 90000);
a("SAM","SAM", 35000, 60000, 80000);
// Asia/ME/Africa/Oceania
a("ME","ME", 40000, 65000, 90000);
a("ME","SAF", 40000, 70000, 130000);
a("IN","ME", 35000, 60000, 80000);
a("ME","SEA", 50000, 125000, 215000);
a("FE","ME", 80000, 142000, 222000);
a("ME","OC", 95000, 215000, 330000);
a("SAF","SAF", 35000, 60000, 80000);
a("IN","SAF", 50000, 125000, 215000);
a("SAF","SEA", 80000, 142000, 222000);
a("FE","SAF", 95000, 215000, 330000);
a("IN","IN", 35000, 60000, 80000);
a("IN","SEA", 42000, 75000, 140000);
a("FE","IN", 42000, 75000, 140000);
a("IN","OC", 80000, 142000, 222000);
a("SEA","SEA", 35000, 60000, 80000);
a("FE","SEA", 42000, 75000, 140000);
a("OC","SEA", 70000, 135000, 215000);
a("FE","FE", 35000, 60000, 80000);
a("FE","OC", 55000, 125000, 215000);
a("OC","OC", 35000, 60000, 80000);
// Hawaii specific
a("CAM","HI", 50000, 125000, 215000);
a("HI","SAM", 50000, 142000, 222000);
a("HI","ME", 80000, 215000, 330000);
a("HI","SAF", 95000, 215000, 330000);
a("HI","IN", 95000, 215000, 330000);
a("HI","SEA", 95000, 125000, 215000);
a("FE","HI", 50000, 75000, 140000);
a("HI","OC", 42000, 75000, 140000);
// Cross Americas-Asia
a("CAM","ME", 100000, 172000, 242000);
a("CAM","SAF", 100000, 172000, 242000);
a("CAM","IN", 95000, 215000, 330000);
a("CAM","SEA", 95000, 215000, 330000);
a("CAM","FE", 95000, 215000, 330000);
a("CAM","OC", 80000, 142000, 222000);
a("ME","SAM", 95000, 215000, 330000);
a("SAF","SAM", 50000, 125000, 215000);
a("IN","SAM", 95000, 215000, 330000);
a("SAM","SEA", 95000, 215000, 330000);
a("FE","SAM", 95000, 215000, 330000);
a("OC","SAM", 80000, 142000, 222000);
a("OC","SAF", 95000, 215000, 330000);

const CHARTS = C;

export const slug = "miles-and-more";

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);

  // LH Group own-metal — dynamic
  if (carriers.length > 0 && carriers.every((c) => LH_GROUP.has(c))) {
    return [{ programme: "milesmore", chart: "dynamic", season: "default",
      economy: [0, 0], premium_economy: null, business: [0, 0], first: null }];
  }

  const oz = getZone(legs[0].origin_cc, legs[0].origin);
  const dz = getZone(legs[legs.length - 1].destination_cc, legs[legs.length - 1].destination);
  if (!oz || !dz) return [];

  const key = pairKey(oz, dz);
  const chart = CHARTS[key];
  if (!chart) return [];

  const [e, b, f] = chart;
  // Round-trip halved for one-way
  const wrap = (v) => [v / 2, v / 2];
  return [{
    programme: "milesmore", chart: "partner", season: "default",
    economy: wrap(e), premium_economy: null, business: wrap(b), first: wrap(f),
  }];
}
