/**
 * Miles&Go (TAP Air Portugal) — Zone-based charts
 *
 * TAP own-metal: partially dynamic — return [0,0] for own-metal
 * Partner (Star Alliance): zone-based with limited published data
 *
 * Source: vault Award Charts/Miles&Go.md
 * HOW TO REFRESH: Update zone maps and charts below when full chart is published
 */

import { makeEntry, resolveChart, pairKey } from "../../shared.js";

const BOOKABLE = new Set(["A3","AC","AD","AI","AV","BR","CA","CM","EK","ET","EY","G3","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VL","ZH"]);

const TP_CARRIERS = new Set(["TP"]);

// 11-zone mapping
const ZONE = {
  PT: "PT",
  // Spain / North Africa
  ES: "SNA", MA: "SNA", TN: "SNA",
  // Europe
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU", AT: "EU",
  IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU", IT: "EU", GR: "EU",
  PL: "EU", CZ: "EU", HU: "EU", RO: "EU", BG: "EU", HR: "EU", RS: "EU",
  SK: "EU", SI: "EU", TR: "EU", RU: "EU", IS: "EU", LT: "EU", LV: "EU",
  EE: "EU", UA: "EU", BY: "EU", LU: "EU", CY: "EU", MT: "EU",
  // Western Africa
  SN: "WAF", CI: "WAF", GH: "WAF", NG: "WAF", CM: "WAF", GA: "WAF",
  CV: "WAF", GW: "WAF", ML: "WAF", BF: "WAF", NE: "WAF", GM: "WAF",
  GN: "WAF", BJ: "WAF", TG: "WAF",
  // Austral Africa
  ZA: "AAF", MZ: "AAF", AO: "AAF", KE: "AAF", TZ: "AAF", ET: "AAF",
  // Middle East
  AE: "ME", SA: "ME", QA: "ME", BH: "ME", KW: "ME", OM: "ME",
  IL: "ME", JO: "ME", EG: "ME", LB: "ME", IR: "ME", IQ: "ME",
  // North America
  US: "NAM", CA: "NAM",
  // Central America
  CR: "CAM", PA: "CAM", GT: "CAM", HN: "CAM", SV: "CAM", NI: "CAM",
  MX: "CAM", CU: "CAM", DO: "CAM",
  // South America
  BR: "SAM", AR: "SAM", CL: "SAM", CO: "SAM", PE: "SAM", VE: "SAM",
  EC: "SAM", BO: "SAM", PY: "SAM", UY: "SAM",
  // Asia / Oceania
  JP: "ASOC", KR: "ASOC", CN: "ASOC", HK: "ASOC", TW: "ASOC",
  TH: "ASOC", SG: "ASOC", MY: "ASOC", ID: "ASOC", PH: "ASOC", VN: "ASOC",
  IN: "ASOC", LK: "ASOC", BD: "ASOC", NP: "ASOC", PK: "ASOC",
  AU: "ASOC", NZ: "ASOC",
};

// Partner chart — one-way values from the vault
// [economy, business, first]
// Only selected routes have published data
const PTR = {};
function pt(a, b, e, biz, f) { PTR[pairKey(a, b)] = [e, biz, f]; }

// Intra-region (e.g., within Asia)
pt("ASOC", "ASOC",  30000, 50000, 60000);
pt("EU", "EU",      30000, 50000, 60000);
pt("NAM", "NAM",    30000, 50000, 60000);

// North America — Europe
pt("NAM", "EU",     50000, 100000, 140000);
pt("NAM", "PT",     50000, 100000, 140000);
pt("NAM", "SNA",    50000, 100000, 140000);

// Europe — Asia/Oceania (long-haul)
pt("EU", "ASOC",    70000, 130000, 180000);
pt("PT", "ASOC",    70000, 130000, 180000);
pt("SNA", "ASOC",   70000, 130000, 180000);

// Europe — South America
pt("EU", "SAM",     60000, 113000, 160000);
pt("PT", "SAM",     60000, 113000, 160000);

// Europe — Africa
pt("EU", "WAF",     50000, 90000, 130000);
pt("PT", "WAF",     50000, 90000, 130000);
pt("EU", "AAF",     60000, 110000, 160000);
pt("PT", "AAF",     60000, 110000, 160000);

// Europe — Middle East
pt("EU", "ME",      50000, 90000, 130000);
pt("PT", "ME",      50000, 90000, 130000);

// Europe — North America (redundant but for lookup consistency)
pt("EU", "NAM",     50000, 100000, 140000);

// Long-haul cross-continental max
pt("NAM", "ASOC",   100000, 160000, 230000);
pt("SAM", "ASOC",   100000, 160000, 230000);
pt("NAM", "SAM",    60000, 113000, 160000);

// Portugal domestic / short-haul
pt("PT", "PT",      3250, 26500, null);
pt("PT", "SNA",     7000, 30000, null);
pt("PT", "EU",      30000, 50000, 60000);
pt("SNA", "EU",     30000, 50000, 60000);

// Middle East — Asia
pt("ME", "ASOC",    60000, 110000, 160000);

// Africa — Americas
pt("WAF", "NAM",    70000, 130000, 180000);
pt("AAF", "NAM",    80000, 140000, 200000);
pt("WAF", "SAM",    60000, 110000, 160000);

export const slug = "miles-and-go";

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, TP_CARRIERS);
  const entries = [];

  // TAP own-metal — dynamic pricing, return [0,0]
  if (chart !== "partner") {
    entries.push(makeEntry("milesgo", "own_dynamic", "default", 0, null, 0, null));
  }

  // Star Alliance partner chart
  if (chart !== "own") {
    const oz = ZONE[originCC];
    const dz = ZONE[destCC];

    if (oz && dz) {
      const key = pairKey(oz, dz);
      const row = PTR[key];

      if (row) {
        const [e, biz, f] = row;
        const wrap = (v) => v === null || v === undefined ? null : [v, v];
        entries.push({
          programme: "milesgo", chart: "partner", season: "default",
          economy: wrap(e), premium_economy: null, business: wrap(biz), first: wrap(f),
        });
      }
    }
  }

  return entries;
}
