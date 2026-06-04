/**
 * ShebaMiles (Ethiopian Airlines) — Zone-based chart
 *
 * ET own-metal: 13-zone system. Pricing varies by origin zone.
 * Business/First combined into single column.
 * Star Alliance partner: dynamic calculator only, no static matrix.
 *
 * Source: vault Award Charts/ShebaMiles.md
 * HOW TO REFRESH: Update zone maps and charts below
 */

import { resolveChart, pairKey } from "../../shared.js";

// Star Alliance members (26)
const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","G3","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","ZH"]);

const ET_CARRIERS = new Set(["ET"]);

// 13-zone mapping
const ZONE = {
  // East Africa
  BI: "EAF", DJ: "EAF", ER: "EAF", ET: "EAF", KE: "EAF",
  RW: "EAF", SD: "EAF", TZ: "EAF", UG: "EAF",
  // North Africa
  DZ: "NAF", CY: "NAF", EG: "NAF", LY: "NAF", MA: "NAF", TN: "NAF",
  // Southern Africa
  AO: "SAF", BW: "SAF", CD: "SAF", CG: "SAF", LS: "SAF", MG: "SAF",
  MW: "SAF", MU: "SAF", MZ: "SAF", NA: "SAF", ZA: "SAF", SZ: "SAF",
  ZM: "SAF", ZW: "SAF",
  // West Africa
  BJ: "WAF", BF: "WAF", CM: "WAF", CV: "WAF", CF: "WAF", TD: "WAF",
  CI: "WAF", GQ: "WAF", GA: "WAF", GM: "WAF", GH: "WAF", GN: "WAF",
  GW: "WAF", LR: "WAF", ML: "WAF", NG: "WAF", SN: "WAF", SL: "WAF",
  TG: "WAF",
  // Middle East
  BH: "ME", IR: "ME", IQ: "ME", IL: "ME", JO: "ME", KW: "ME",
  LB: "ME", OM: "ME", QA: "ME", SA: "ME", SY: "ME", AE: "ME", YE: "ME",
  // Europe
  AL: "EU", AM: "EU", AT: "EU", BY: "EU", BE: "EU", BA: "EU",
  BG: "EU", HR: "EU", CZ: "EU", DK: "EU", EE: "EU", FI: "EU",
  FR: "EU", GE: "EU", DE: "EU", GR: "EU", HU: "EU", IS: "EU",
  IE: "EU", IT: "EU", KZ: "EU", LV: "EU", LT: "EU", LU: "EU",
  MK: "EU", MT: "EU", MD: "EU", ME: "EU", NL: "EU", NO: "EU",
  PL: "EU", PT: "EU", RO: "EU", RU: "EU", RS: "EU", SK: "EU",
  SI: "EU", ES: "EU", SE: "EU", CH: "EU", TR: "EU", TM: "EU",
  UA: "EU", GB: "EU", UZ: "EU",
  // Central Asia (incl. India)
  AF: "CA", AZ: "CA", BD: "CA", IN: "CA", KG: "CA", MN: "CA",
  NP: "CA", PK: "CA", LK: "CA", TJ: "CA",
  // Far East
  CN: "FE", HK: "FE", JP: "FE", KR: "FE", MO: "FE", TW: "FE",
  // Southeast Asia
  BN: "SEA", KH: "SEA", ID: "SEA", LA: "SEA", MY: "SEA", MM: "SEA",
  PH: "SEA", SG: "SEA", TH: "SEA", VN: "SEA",
  // Australasia / Pacific
  AU: "OC", NZ: "OC", FJ: "OC",
  // North America
  US: "NAM", CA: "NAM",
  // Central America & Caribbean (includes Mexico, Ecuador in ShebaMiles zones)
  MX: "CAC", GT: "CAC", HN: "CAC", SV: "CAC", NI: "CAC", PA: "CAC",
  CU: "CAC", DO: "CAC", JM: "CAC", BS: "CAC", BB: "CAC", TT: "CAC",
  EC: "CAC", BZ: "CAC", HT: "CAC", AG: "CAC", BM: "CAC",
  // South America (includes Costa Rica, Guatemala, Nicaragua in vault)
  AR: "SAM", BO: "SAM", BR: "SAM", CL: "SAM", CO: "SAM",
  CR: "SAM", PE: "SAM", PY: "SAM", UY: "SAM", VE: "SAM",
};

function getZone(cc) {
  return ZONE[cc] || null;
}

// Ethiopian-operated chart — one-way pricing
// Key = pairKey(originZone, destZone), Value = [economy, bizFirst]
const ET_OWN = {};
function eo(a, b, e, bf) { ET_OWN[pairKey(a, b)] = [e, bf]; }

// From East Africa
eo("EAF", "ME",   10000, 21000);
eo("EAF", "SAF",  15000, 21000);
eo("EAF", "WAF",  15000, 21000);
eo("EAF", "CA",   25000, 35000);
eo("EAF", "EU",   25000, 42000);
eo("EAF", "SEA",  25000, 49000);
eo("EAF", "NAM",  30000, 42000);
eo("EAF", "FE",   35000, 49000);

// From North Africa
eo("NAF", "ME",   15000, 21000);
eo("NAF", "EU",   30000, 42000);
eo("NAF", "FE",   35000, 49000);
eo("NAF", "CA",   35000, 49000);
eo("NAF", "SEA",  35000, 49000);
eo("NAF", "SAF",  35000, 49000);
eo("NAF", "NAM",  50000, 70000);

// From Southern Africa
eo("SAF", "CA",   20000, 28000);
eo("SAF", "ME",   25000, 39000);
eo("SAF", "OC",   30000, 42000);
eo("SAF", "EU",   35000, 49000);
eo("SAF", "FE",   35000, 49000);
eo("SAF", "SEA",  35000, 49000);
eo("SAF", "NAM",  40000, 56000);

// From West-South Africa (inter-Africa)
eo("WAF", "SAF",  15000, 21000);
eo("WAF", "NAM",  25000, 35000);  // NAF→NAM in vault but also WAF context
eo("WAF", "EU",   30000, 42000);

// From Middle East
eo("ME", "CA",    30000, 42000);
eo("ME", "FE",    30000, 42000);
eo("ME", "SEA",   35000, 49000);

// From Europe
eo("EU", "CA",    30000, 42000);
eo("EU", "ME",    30000, 42000);
eo("EU", "NAM",   35000, 49000);
eo("EU", "WAF",   35000, 49000);  // Central Africa mapped to WAF
eo("EU", "CAC",   40000, 56000);
eo("EU", "SAM",   40000, 56000);
eo("EU", "FE",    50000, 70000);
eo("EU", "SEA",   50000, 70000);
eo("EU", "OC",    60000, 84000);

// From Central Asia (incl. India)
eo("CA", "FE",    10000, 14000);
eo("CA", "NAM",   25000, 35000);
eo("CA", "SEA",   30000, 42000);

// From Southeast Asia
eo("SEA", "OC",   30000, 56000);
eo("SEA", "NAM",  40000, 63000);
eo("SEA", "SAM",  40000, 63000);

// From Central America & Caribbean
eo("CAC", "OC",   15000, 31500);

// From North America
eo("NAM", "CAC",  15000, 21000);
eo("NAM", "SAM",  25000, 35000);
eo("NAM", "OC",   30000, 49000);
eo("NAM", "FE",   35000, 56000);
eo("NAM", "SEA",  40000, 63000);

// From South America
eo("SAM", "CAC",  15000, 21000);
eo("SAM", "OC",   20000, 42000);

export const slug = "shebamiles";

export const bookable = BOOKABLE;

export function handle(legs) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, ET_CARRIERS);
  const entries = [];

  const oz = getZone(originCC);
  const dz = getZone(destCC);
  if (!oz || !dz) return [];

  // Ethiopian own-metal
  if (chart !== "partner") {
    const key = pairKey(oz, dz);
    const own = ET_OWN[key];

    if (own) {
      const [e, bf] = own;
      entries.push({
        programme: "shebamiles", chart: "own", season: "default",
        economy: [e, e], premium_economy: null,
        business: [bf, bf], first: [bf, bf],  // Business/First same price
      });
    }
  }

  // Star Alliance partner chart — dynamic calculator only, no static data

  return entries;
}
