import { makeEntry, resolveChart, pairKey } from "../../shared.js";

const BOOKABLE = new Set(["A3","AC","AD","AI","AV","BR","CA","CM","ET","G3","LH","LO","LX","MS","NH","NZ","OA","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VL","ZH"]);

const TK_ZONE = {
  TR: "Türkiye",
  GB: "Europe 1", FR: "Europe 1", DE: "Europe 1", NL: "Europe 1", BE: "Europe 1",
  CH: "Europe 1", AT: "Europe 1", IE: "Europe 1", DK: "Europe 1", SE: "Europe 1",
  NO: "Europe 1", FI: "Europe 1", LU: "Europe 1", IS: "Europe 1",
  IT: "Europe 2", ES: "Europe 2", PT: "Europe 2", GR: "Europe 2", PL: "Europe 2",
  RO: "Europe 2", BG: "Europe 2", CZ: "Europe 2", HU: "Europe 2", HR: "Europe 2",
  RS: "Europe 2", SK: "Europe 2", SI: "Europe 2", BA: "Europe 2", ME: "Europe 2",
  MK: "Europe 2", AL: "Europe 2", XK: "Europe 2", LT: "Europe 2", LV: "Europe 2",
  EE: "Europe 2", CY: "Europe 2", MT: "Europe 2", MD: "Europe 2", UA: "Europe 2",
  BY: "Europe 2", GE: "Europe 2", AM: "Europe 2", AZ: "Europe 2", RU: "Europe 2",
  IN: "Central Asia", PK: "Central Asia", BD: "Central Asia", LK: "Central Asia",
  NP: "Central Asia", MV: "Central Asia", AF: "Central Asia", KZ: "Central Asia",
  UZ: "Central Asia", TM: "Central Asia", KG: "Central Asia", TJ: "Central Asia",
  MN: "Central Asia",
  AE: "Middle East", SA: "Middle East", QA: "Middle East", BH: "Middle East",
  KW: "Middle East", OM: "Middle East", JO: "Middle East", LB: "Middle East",
  IQ: "Middle East", IR: "Middle East", IL: "Middle East", PS: "Middle East",
  YE: "Middle East", SY: "Middle East",
  MA: "North Africa", TN: "North Africa", DZ: "North Africa", LY: "North Africa",
  EG: "North Africa",
  NG: "Central Africa", GH: "Central Africa", SN: "Central Africa", CI: "Central Africa",
  CM: "Central Africa", GA: "Central Africa", CG: "Central Africa", CD: "Central Africa",
  ML: "Central Africa", BF: "Central Africa", NE: "Central Africa", TD: "Central Africa",
  GN: "Central Africa", BJ: "Central Africa", TG: "Central Africa", MR: "Central Africa",
  SL: "Central Africa", LR: "Central Africa", GW: "Central Africa", GM: "Central Africa",
  CV: "Central Africa", GQ: "Central Africa", CF: "Central Africa", ST: "Central Africa",
  ZA: "Southern Africa", KE: "Southern Africa", TZ: "Southern Africa", ET: "Southern Africa",
  MZ: "Southern Africa", ZW: "Southern Africa", ZM: "Southern Africa", MW: "Southern Africa",
  BW: "Southern Africa", NA: "Southern Africa", UG: "Southern Africa", RW: "Southern Africa",
  BI: "Southern Africa", MG: "Southern Africa", MU: "Southern Africa", SC: "Southern Africa",
  DJ: "Southern Africa", ER: "Southern Africa", SO: "Southern Africa", SS: "Southern Africa",
  SD: "Southern Africa", AO: "Southern Africa", SZ: "Southern Africa", LS: "Southern Africa",
  KM: "Southern Africa", RE: "Southern Africa",
  CN: "Far East", HK: "Far East", TW: "Far East", JP: "Far East", KR: "Far East",
  TH: "Far East", SG: "Far East", MY: "Far East", ID: "Far East", PH: "Far East",
  VN: "Far East", MM: "Far East", KH: "Far East", LA: "Far East", BN: "Far East",
  MO: "Far East", TL: "Far East",
  US: "North America", CA: "North America", MX: "North America",
  BR: "South America", AR: "South America", CL: "South America", CO: "South America",
  PE: "South America", VE: "South America", EC: "South America", BO: "South America",
  PY: "South America", UY: "South America", GY: "South America", SR: "South America",
  GF: "South America", PA: "South America", CR: "South America", GT: "South America",
  HN: "South America", SV: "South America", NI: "South America", BZ: "South America",
  CU: "South America", DO: "South America", HT: "South America", JM: "South America",
  TT: "South America", BS: "South America", BB: "South America", AG: "South America",
  LC: "South America", VC: "South America", GD: "South America", DM: "South America",
  KN: "South America", PR: "South America", AW: "South America", CW: "South America",
  AU: "Oceania", NZ: "Oceania", FJ: "Oceania", PG: "Oceania", WS: "Oceania",
  TO: "Oceania", VU: "Oceania", SB: "Oceania", NC: "Oceania", PF: "Oceania",
  GU: "Oceania",
};

const HAWAII_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO","MKK","LNY","JHM","HPH"]);

const TK_OPERATED = {
  "Türkiye":          { promotion: { economy: 4500,  business: 10000 },  standard: { economy: 8500,   business: 15000 } },
  "Europe 1":         { promotion: { economy: 10000, business: 20000 },  standard: { economy: 15000,  business: 30000 } },
  "Europe 2":         { promotion: { economy: 15000, business: 25000 },  standard: { economy: 20000,  business: 40000 } },
  "Central Asia":     { promotion: { economy: 20000, business: 35000 },  standard: { economy: 25000,  business: 50000 } },
  "Middle East":      { promotion: { economy: 18000, business: 28000 },  standard: { economy: 23000,  business: 45000 } },
  "North Africa":     { promotion: { economy: 20000, business: 40000 },  standard: { economy: 35000,  business: 55000 } },
  "Central Africa":   { promotion: { economy: 25000, business: 60000 },  standard: { economy: 55000,  business: 110000 } },
  "Southern Africa":  { promotion: { economy: 35000, business: 75000 },  standard: { economy: 70000,  business: 150000 } },
  "Far East":         { promotion: { economy: 35000, business: 65000 },  standard: { economy: 55000,  business: 140000 } },
  "North America":    { promotion: { economy: 40000, business: 65000 },  standard: { economy: 55000,  business: 135000 } },
  "South America":    { promotion: { economy: 50000, business: 75000 },  standard: { economy: 65000,  business: 145000 } },
  "Oceania":          { promotion: { economy: 60000, business: 140000 }, standard: { economy: 100000, business: 210000 } },
};

const TK_PARTNER = {};
function tp(a, b, economy, business, first) {
  TK_PARTNER[pairKey(a, b)] = { economy, business, first };
}
tp("Türkiye", "Europe 1",        10000,  20000,  30000);
tp("Türkiye", "Europe 2",        15000,  25000,  35000);
tp("Türkiye", "Central Asia",    20000,  35000,  50000);
tp("Türkiye", "Middle East",     18000,  28000,  40000);
tp("Türkiye", "North Africa",    20000,  40000,  60000);
tp("Türkiye", "Central Africa",  25000,  60000,  90000);
tp("Türkiye", "Southern Africa", 35000,  75000,  110000);
tp("Türkiye", "Far East",        35000,  65000,  100000);
tp("Türkiye", "North America",   40000,  65000,  100000);
tp("Türkiye", "South America",   50000,  75000,  110000);
tp("Türkiye", "Oceania",         60000,  140000, 200000);
tp("Europe 1", "Europe 2",        25000,  35000,  45000);
tp("Europe 1", "Central Asia",    30000,  55000,  80000);
tp("Europe 1", "Middle East",     28000,  48000,  70000);
tp("Europe 1", "North Africa",    30000,  60000,  90000);
tp("Europe 1", "Central Africa",  35000,  80000,  120000);
tp("Europe 1", "Southern Africa", 45000,  95000,  140000);
tp("Europe 1", "Far East",        45000,  85000,  130000);
tp("Europe 1", "North America",   50000,  85000,  130000);
tp("Europe 1", "South America",   60000,  95000,  140000);
tp("Europe 1", "Oceania",         70000,  160000, 230000);
tp("Europe 2", "Central Asia",    35000,  60000,  90000);
tp("Europe 2", "Middle East",     33000,  53000,  80000);
tp("Europe 2", "North Africa",    35000,  65000,  100000);
tp("Europe 2", "Central Africa",  40000,  85000,  130000);
tp("Europe 2", "Southern Africa", 50000,  100000, 150000);
tp("Europe 2", "Far East",        50000,  90000,  135000);
tp("Europe 2", "North America",   55000,  90000,  135000);
tp("Europe 2", "South America",   65000,  100000, 150000);
tp("Europe 2", "Oceania",         75000,  165000, 230000);
tp("Central Asia", "Middle East",     38000,  63000,  95000);
tp("Central Asia", "North Africa",    40000,  75000,  110000);
tp("Central Asia", "Central Africa",  45000,  95000,  140000);
tp("Central Asia", "Southern Africa", 55000,  110000, 165000);
tp("Central Asia", "Far East",        55000,  100000, 150000);
tp("Central Asia", "North America",   60000,  100000, 150000);
tp("Central Asia", "South America",   70000,  110000, 165000);
tp("Central Asia", "Oceania",         80000,  175000, 250000);
tp("Middle East", "North Africa",    38000,  68000,  100000);
tp("Middle East", "Central Africa",  43000,  88000,  130000);
tp("Middle East", "Southern Africa", 53000,  103000, 150000);
tp("Middle East", "Far East",        53000,  93000,  140000);
tp("Middle East", "North America",   58000,  93000,  140000);
tp("Middle East", "South America",   68000,  103000, 150000);
tp("Middle East", "Oceania",         78000,  168000, 240000);
tp("North Africa", "Central Africa",  45000,  100000, 150000);
tp("North Africa", "Southern Africa", 55000,  115000, 170000);
tp("North Africa", "Far East",        55000,  105000, 160000);
tp("North Africa", "North America",   60000,  105000, 160000);
tp("North Africa", "South America",   70000,  115000, 170000);
tp("North Africa", "Oceania",         80000,  180000, 260000);
tp("Central Africa", "Southern Africa", 60000,  135000, 200000);
tp("Central Africa", "Far East",        60000,  125000, 190000);
tp("Central Africa", "North America",   65000,  125000, 190000);
tp("Central Africa", "South America",   75000,  135000, 200000);
tp("Central Africa", "Oceania",         85000,  200000, 285000);
tp("Southern Africa", "Far East",        70000,  140000, 210000);
tp("Southern Africa", "North America",   75000,  140000, 210000);
tp("Southern Africa", "South America",   85000,  150000, 225000);
tp("Southern Africa", "Oceania",         95000,  215000, 310000);
tp("Far East", "North America",   75000,  130000, 195000);
tp("Far East", "South America",   85000,  140000, 210000);
tp("Far East", "Oceania",         95000,  205000, 290000);
tp("North America", "South America", 90000,  140000, 210000);
tp("North America", "Oceania",       100000, 205000, 290000);
tp("South America", "Oceania", 110000, 215000, 310000);

const TK_DOMESTIC = { economy: 15000, business: 22500, first: 30000 };
const TK_HAWAII   = { economy: 25000, business: 40000, first: 50000 };
const TK_CARRIERS = new Set(["TK"]);

export const slug = "turkish-miles-and-smiles";

export const bookable = BOOKABLE;

export function handle(legs) {
  const originZone = TK_ZONE[legs[0].origin_cc] || null;
  const destZone = TK_ZONE[legs[legs.length - 1].destination_cc] || null;
  if (!originZone || !destZone) return [];

  const chart = resolveChart(legs, TK_CARRIERS);
  const entries = [];

  if (originZone === destZone && originZone === "Türkiye" && legs[0].origin_cc === legs[legs.length - 1].destination_cc) {
    if (chart !== "partner") {
      const promo = TK_OPERATED["Türkiye"].promotion;
      const std = TK_OPERATED["Türkiye"].standard;
      entries.push(makeEntry("turkish", "tk_operated", "promotion", promo.economy, null, promo.business, null));
      entries.push(makeEntry("turkish", "tk_operated", "standard", std.economy, null, std.business, null));
    }
    return entries;
  }

  if (chart !== "partner") {
    let tkZone = null;
    if (originZone === "Türkiye") tkZone = destZone;
    else if (destZone === "Türkiye") tkZone = originZone;
    // Also check intermediate stops — e.g. DEL-IST-LHR transits Turkey
    // TK operated chart applies when one leg endpoint is in Turkey, even for connecting awards
    if (!tkZone) {
      const touchesTurkey = legs.some((l) => TK_ZONE[l.origin_cc] === "Türkiye" || TK_ZONE[l.destination_cc] === "Türkiye");
      if (touchesTurkey) {
        // For connecting awards via Turkey, TK uses the farther zone from Turkey
        const cost = (z) => TK_OPERATED[z]?.standard?.economy || 0;
        tkZone = cost(originZone) >= cost(destZone) ? originZone : destZone;
      }
    }
    if (tkZone && TK_OPERATED[tkZone]) {
      const promo = TK_OPERATED[tkZone].promotion;
      const std = TK_OPERATED[tkZone].standard;
      entries.push(makeEntry("turkish", "tk_operated", "promotion", promo.economy, null, promo.business, null));
      entries.push(makeEntry("turkish", "tk_operated", "standard", std.economy, null, std.business, null));
    }
  }

  if (chart !== "own") {
    if (originZone !== destZone) {
      const isHawaii = (originZone === "North America" || destZone === "North America") &&
        legs.some((l) => HAWAII_AIRPORTS.has(l.origin) || HAWAII_AIRPORTS.has(l.destination));
      if (isHawaii) {
        entries.push(makeEntry("turkish", "partner", "default", TK_HAWAII.economy, null, TK_HAWAII.business, TK_HAWAII.first));
      } else {
        const isDomestic = originZone === destZone &&
          legs[0].origin_cc === legs[legs.length - 1].destination_cc && legs[0].origin_cc === "US";
        if (isDomestic) {
          entries.push(makeEntry("turkish", "partner", "default", TK_DOMESTIC.economy, null, TK_DOMESTIC.business, TK_DOMESTIC.first));
        } else {
          const p = TK_PARTNER[pairKey(originZone, destZone)];
          if (p) entries.push(makeEntry("turkish", "partner", "default", p.economy, null, p.business, p.first));
        }
      }
    } else {
      if (legs[0].origin_cc === "US" && legs[legs.length - 1].destination_cc === "US") {
        entries.push(makeEntry("turkish", "partner", "default", TK_DOMESTIC.economy, null, TK_DOMESTIC.business, TK_DOMESTIC.first));
      }
    }
  }

  return entries;
}
