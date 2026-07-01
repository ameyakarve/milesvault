/**
 * ShebaMiles (Ethiopian Airlines) — Zone-based charts
 *
 * ET own-metal: 13-region system, symmetric region pair. Business/First combined.
 * Star Alliance partner: 13-region matrix, DIRECTIONAL (one asymmetric pair:
 *   East Africa->West Africa 12k vs West Africa->East Africa 22k). One-way values;
 *   Business = 1.5x Economy, First ~= 1.75x Economy. Priced end-to-end (origin
 *   region -> destination region), NOT per-segment — a Star Alliance award is a
 *   single reservation regardless of how many partner carriers it uses.
 *
 * Region map and the partner matrix are transcribed from the official ShebaMiles
 * Star Alliance flight-award calculator + its published region/country table.
 * HOW TO REFRESH: re-read the calculator; update ZONE, ST_PARTNER and/or ET_OWN.
 */

import { pairKey } from "../../shared.js";

// Star Alliance members (26)
const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","G3","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","ZH"]);

const ET_CARRIERS = new Set(["ET"]);

// 13-region mapping (ISO country code -> region), transcribed verbatim from the
// official ShebaMiles region/country table. A few entries look geographically
// odd but mirror the airline's own table (e.g. Guatemala/Nicaragua/Guam/Niue in
// South America; Maldives/PNG in Oceania) — kept faithful to the source.
const ZONE = {
  // East Africa
  BI: "EAF", DJ: "EAF", ER: "EAF", ET: "EAF", KE: "EAF", RW: "EAF", SD: "EAF", TZ: "EAF", UG: "EAF",
  // North Africa
  CY: "NAF", DZ: "NAF", EG: "NAF", LY: "NAF", MA: "NAF", TN: "NAF",
  // Southern Africa
  AO: "SAF", BW: "SAF", CD: "SAF", CG: "SAF", LS: "SAF", MG: "SAF", MU: "SAF", MW: "SAF", MZ: "SAF", NA: "SAF",
  SZ: "SAF", ZA: "SAF", ZM: "SAF", ZW: "SAF",
  // West Africa
  BF: "WAF", BJ: "WAF", CF: "WAF", CI: "WAF", CM: "WAF", CV: "WAF", GA: "WAF", GH: "WAF", GM: "WAF", GN: "WAF",
  GQ: "WAF", GW: "WAF", LR: "WAF", ML: "WAF", NG: "WAF", SL: "WAF", SN: "WAF", TD: "WAF", TG: "WAF",
  // Middle East
  AE: "ME", BH: "ME", IL: "ME", IQ: "ME", IR: "ME", JO: "ME", KW: "ME", LB: "ME", OM: "ME", QA: "ME",
  SA: "ME", SY: "ME", YE: "ME",
  // Europe
  AL: "EU", AM: "EU", AT: "EU", BA: "EU", BE: "EU", BG: "EU", BY: "EU", CH: "EU", CZ: "EU", DE: "EU",
  DK: "EU", EE: "EU", ES: "EU", FI: "EU", FR: "EU", GB: "EU", GE: "EU", GR: "EU", HR: "EU", HU: "EU",
  IE: "EU", IS: "EU", IT: "EU", KZ: "EU", LT: "EU", LU: "EU", LV: "EU", MD: "EU", ME: "EU", MK: "EU",
  MT: "EU", NL: "EU", NO: "EU", PL: "EU", PT: "EU", RO: "EU", RS: "EU", RU: "EU", SE: "EU", SI: "EU",
  SK: "EU", TM: "EU", TR: "EU", UA: "EU", UZ: "EU",
  // Central Asia (incl. India)
  AF: "CA", AZ: "CA", BD: "CA", IN: "CA", KG: "CA", LK: "CA", MN: "CA", NP: "CA", PK: "CA", TJ: "CA",
  // Far East
  CN: "FE", HK: "FE", JP: "FE", KR: "FE", MO: "FE", MP: "FE", TW: "FE",
  // Southeast Asia
  BN: "SEA", ID: "SEA", KH: "SEA", LA: "SEA", MM: "SEA", MY: "SEA", PH: "SEA", SG: "SEA", TH: "SEA", VN: "SEA",
  // Australasia, New Zealand & Oceania
  AU: "OC", CK: "OC", FJ: "OC", FM: "OC", MH: "OC", MV: "OC", NC: "OC", NF: "OC", NZ: "OC", PF: "OC",
  PG: "OC", PW: "OC", ST: "OC", TO: "OC", VU: "OC", WS: "OC",
  // North America
  CA: "NAM", US: "NAM",
  // Central America & Caribbean
  AG: "CAC", AN: "CAC", AW: "CAC", BB: "CAC", BM: "CAC", BS: "CAC", BZ: "CAC", CU: "CAC", DM: "CAC", DO: "CAC",
  EC: "CAC", GD: "CAC", GP: "CAC", HN: "CAC", HT: "CAC", JM: "CAC", KN: "CAC", KY: "CAC", LC: "CAC", MQ: "CAC",
  MX: "CAC", PA: "CAC", PR: "CAC", SV: "CAC", TC: "CAC", TT: "CAC", VG: "CAC", VI: "CAC",
  // South America
  AR: "SAM", BO: "SAM", BR: "SAM", CL: "SAM", CO: "SAM", CR: "SAM", GT: "SAM", GU: "SAM", NI: "SAM", NU: "SAM",
  PE: "SAM", PY: "SAM", UY: "SAM", VE: "SAM",
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

// Star Alliance partner chart — DIRECTIONAL region pair "ORIGIN|DEST" ->
// [economy, business, first], one-way. Transcribed from the official ShebaMiles
// Star Alliance flight-award calculator (all 157 offered pairs; the 12 pairs it
// returns no value for — Oceania <-> Africa/Middle East/Central Asia — are simply
// absent here). Priced end-to-end, not per-segment.
const ST_PARTNER = {
  "NAF|NAF": [30000, 45000, 52000], "NAF|EAF": [45000, 67000, 79000], "NAF|WAF": [55000, 82000, 96000], "NAF|SAF": [50000, 75000, 87000], "NAF|ME": [30000, 45000, 52000], "NAF|EU": [50000, 75000, 87000], "NAF|CA": [60000, 90000, 105000], "NAF|FE": [80000, 120000, 140000], "NAF|SEA": [80000, 120000, 140000], "NAF|NAM": [90000, 135000, 157000], "NAF|CAC": [100000, 150000, 175000], "NAF|SAM": [120000, 180000, 210000],
  "EAF|NAF": [45000, 67000, 79000], "EAF|EAF": [22000, 33000, 38000], "EAF|WAF": [12000, 23000, 28000], "EAF|SAF": [40000, 60000, 70000], "EAF|ME": [50000, 75000, 87000], "EAF|EU": [40000, 60000, 70000], "EAF|CA": [40000, 60000, 70000], "EAF|FE": [75000, 112000, 131000], "EAF|SEA": [60000, 90000, 105000], "EAF|NAM": [90000, 135000, 157000], "EAF|CAC": [100000, 150000, 175000], "EAF|SAM": [100000, 150000, 175000],
  "WAF|NAF": [55000, 82000, 96000], "WAF|EAF": [22000, 33000, 38000], "WAF|WAF": [25000, 37000, 44000], "WAF|SAF": [50000, 75000, 87000], "WAF|ME": [55000, 82000, 96000], "WAF|EU": [50000, 75000, 87000], "WAF|CA": [70000, 105000, 122000], "WAF|FE": [75000, 112000, 131000], "WAF|SEA": [75000, 112000, 131000], "WAF|NAM": [100000, 150000, 175000], "WAF|CAC": [100000, 150000, 175000], "WAF|SAM": [100000, 150000, 175000],
  "SAF|NAF": [50000, 75000, 87000], "SAF|EAF": [40000, 60000, 70000], "SAF|WAF": [50000, 75000, 87000], "SAF|SAF": [30000, 45000, 52000], "SAF|ME": [45000, 67000, 79000], "SAF|EU": [45000, 67000, 79000], "SAF|CA": [70000, 105000, 122000], "SAF|FE": [90000, 135000, 157000], "SAF|SEA": [90000, 135000, 157000], "SAF|NAM": [100000, 150000, 175000], "SAF|CAC": [80000, 120000, 140000], "SAF|SAM": [70000, 105000, 122000],
  "ME|NAF": [30000, 45000, 52000], "ME|EAF": [50000, 75000, 87000], "ME|WAF": [55000, 82000, 96000], "ME|SAF": [45000, 67000, 79000], "ME|ME": [40000, 60000, 70000], "ME|EU": [40000, 60000, 70000], "ME|CA": [60000, 90000, 105000], "ME|FE": [70000, 105000, 122000], "ME|SEA": [60000, 90000, 105000], "ME|NAM": [100000, 150000, 175000], "ME|CAC": [120000, 180000, 210000], "ME|SAM": [120000, 180000, 210000],
  "EU|NAF": [50000, 75000, 87000], "EU|EAF": [40000, 60000, 70000], "EU|WAF": [50000, 75000, 87000], "EU|SAF": [45000, 67000, 79000], "EU|ME": [40000, 60000, 70000], "EU|EU": [30000, 45000, 52000], "EU|CA": [65000, 97500, 114000], "EU|FE": [80000, 120000, 140000], "EU|SEA": [80000, 120000, 140000], "EU|OC": [100000, 150000, 175000], "EU|NAM": [70000, 105000, 122000], "EU|CAC": [80000, 120000, 140000], "EU|SAM": [80000, 120000, 140000],
  "CA|NAF": [60000, 90000, 105000], "CA|EAF": [40000, 60000, 70000], "CA|WAF": [70000, 105000, 122000], "CA|SAF": [70000, 105000, 122000], "CA|ME": [60000, 90000, 105000], "CA|EU": [65000, 97500, 114000], "CA|CA": [35000, 52000, 61000], "CA|FE": [40000, 60000, 70000], "CA|SEA": [35000, 52000, 61000], "CA|NAM": [100000, 150000, 175000], "CA|CAC": [110000, 165000, 192000], "CA|SAM": [110000, 165000, 192000],
  "FE|NAF": [80000, 120000, 140000], "FE|EAF": [75000, 112000, 131000], "FE|WAF": [75000, 112000, 131000], "FE|SAF": [90000, 135000, 157000], "FE|ME": [70000, 105000, 122000], "FE|EU": [80000, 120000, 140000], "FE|CA": [40000, 60000, 70000], "FE|FE": [40000, 60000, 70000], "FE|SEA": [40000, 60000, 70000], "FE|OC": [70000, 105000, 122000], "FE|NAM": [120000, 180000, 210000], "FE|CAC": [120000, 180000, 210000], "FE|SAM": [120000, 180000, 210000],
  "SEA|NAF": [80000, 120000, 140000], "SEA|EAF": [60000, 90000, 105000], "SEA|WAF": [75000, 112000, 131000], "SEA|SAF": [90000, 135000, 157000], "SEA|ME": [60000, 90000, 105000], "SEA|EU": [80000, 120000, 140000], "SEA|CA": [35000, 52000, 61000], "SEA|FE": [40000, 60000, 70000], "SEA|SEA": [35000, 52000, 61000], "SEA|OC": [60000, 90000, 105000], "SEA|NAM": [120000, 180000, 210000], "SEA|CAC": [120000, 180000, 210000], "SEA|SAM": [120000, 180000, 210000],
  "OC|EU": [100000, 150000, 175000], "OC|FE": [70000, 105000, 122000], "OC|SEA": [60000, 90000, 105000], "OC|OC": [40000, 60000, 70000], "OC|NAM": [80000, 120000, 140000], "OC|CAC": [100000, 150000, 175000], "OC|SAM": [80000, 120000, 140000],
  "NAM|NAF": [90000, 135000, 157000], "NAM|EAF": [90000, 135000, 157000], "NAM|WAF": [100000, 150000, 175000], "NAM|SAF": [100000, 150000, 175000], "NAM|ME": [100000, 150000, 175000], "NAM|EU": [70000, 105000, 122000], "NAM|CA": [100000, 150000, 175000], "NAM|FE": [120000, 180000, 210000], "NAM|SEA": [120000, 180000, 210000], "NAM|OC": [80000, 120000, 140000], "NAM|NAM": [30000, 45000, 52000], "NAM|CAC": [45000, 67000, 79000], "NAM|SAM": [50000, 75000, 87000],
  "CAC|NAF": [100000, 150000, 175000], "CAC|EAF": [100000, 150000, 175000], "CAC|WAF": [100000, 150000, 175000], "CAC|SAF": [80000, 120000, 140000], "CAC|ME": [120000, 180000, 210000], "CAC|EU": [80000, 120000, 140000], "CAC|CA": [110000, 165000, 192000], "CAC|FE": [120000, 180000, 210000], "CAC|SEA": [120000, 180000, 210000], "CAC|OC": [100000, 150000, 175000], "CAC|NAM": [45000, 67000, 79000], "CAC|CAC": [30000, 45000, 52000], "CAC|SAM": [45000, 67000, 79000],
  "SAM|NAF": [120000, 180000, 210000], "SAM|EAF": [100000, 150000, 175000], "SAM|WAF": [100000, 150000, 175000], "SAM|SAF": [70000, 105000, 122000], "SAM|ME": [120000, 180000, 210000], "SAM|EU": [80000, 120000, 140000], "SAM|CA": [110000, 165000, 192000], "SAM|FE": [120000, 180000, 210000], "SAM|SEA": [120000, 180000, 210000], "SAM|OC": [80000, 120000, 140000], "SAM|NAM": [50000, 75000, 87000], "SAM|CAC": [45000, 67000, 79000], "SAM|SAM": [30000, 45000, 52000],
};

export const slug = "shebamiles";

export const bookable = BOOKABLE;

export function handle(legs) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const entries = [];

  const oz = getZone(originCC);
  const dz = getZone(destCC);
  if (!oz || !dz) return [];

  // The Ethiopian chart applies only when the WHOLE itinerary is Ethiopian metal;
  // a single Star Alliance partner segment prices the entire award on the Star
  // Alliance chart. With no carriers specified we can't tell, so offer both.
  const specified = legs.filter((l) => l.carrier);
  const allOwn = specified.length > 0 && specified.every((l) => ET_CARRIERS.has(l.carrier));
  const anyPartner = specified.some((l) => l.carrier && !ET_CARRIERS.has(l.carrier));
  const unknown = specified.length === 0;

  if (allOwn || unknown) {
    // Ethiopian own-metal — symmetric region pair, Business/First combined.
    const own = ET_OWN[pairKey(oz, dz)];
    if (own) {
      const [e, bf] = own;
      entries.push({
        programme: "shebamiles", chart: "own", season: "default",
        economy: [e, e], premium_economy: null,
        business: [bf, bf], first: [bf, bf],  // Business/First same price
      });
    }
  }

  if (anyPartner || unknown) {
    // Star Alliance partner — one end-to-end award priced by ORIGIN region ->
    // DESTINATION region (directional). A given pair may not be offered at all.
    const p = ST_PARTNER[`${oz}|${dz}`];
    if (p) {
      const [e, b, f] = p;
      entries.push({
        programme: "shebamiles", chart: "partner", season: "default",
        economy: [e, e], premium_economy: null,
        business: [b, b], first: f ? [f, f] : null,
      });
    }
  }

  return entries;
}
