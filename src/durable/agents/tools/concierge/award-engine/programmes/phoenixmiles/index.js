/**
 * Air China PhoenixMiles — Zone-based chart
 *
 * CA own-metal: 12-zone system. Round-trip pricing with seasonal variation.
 *   Only selected routes published in vault (China-USA, China-Europe, ME/AF-Europe).
 *
 * Star Alliance partner: separate zone-based chart, limited published data.
 *   Only selected routes published (China-USA, China-Europe, USA-HK/TW, USA-JP/KR, USA-Oceania).
 *
 * Currency unit is "kilometers" (not miles), functions identically to miles.
 * One-way costs more than 50% of round-trip.
 *
 * Source: vault Award Charts/Air China PhoenixMiles.md
 * HOW TO REFRESH: Update zone maps and charts below
 */

import { resolveChart, pairKey } from "../../shared.js";

// Star Alliance subset that CA books (13)
const BOOKABLE = new Set(["AC","AI","BR","CA","ET","LH","LX","NH","OS","OZ","SQ","TK","UA","VL"]);

const CA_CARRIERS = new Set(["CA"]);

// 12-zone mapping
const ZONE = {
  CN: "A",
  HK: "B", MO: "B", TW: "B",
  JP: "C", KR: "C", MN: "C", KP: "C",
  TH: "D", SG: "D", MY: "D", ID: "D", PH: "D",
  VN: "D", MM: "D", KH: "D", LA: "D", BN: "D",
  IN: "E", BD: "E", BT: "E", LK: "E", NP: "E", PK: "E",
  MV: "E", AM: "E", AZ: "E", KG: "E", TJ: "E", UZ: "E",
  GB: "F", FR: "F", DE: "F", NL: "F", BE: "F", CH: "F",
  AT: "F", IE: "F", DK: "F", SE: "F", NO: "F", FI: "F",
  IT: "F", ES: "F", PT: "F", GR: "F", PL: "F", CZ: "F",
  HU: "F", RO: "F", BG: "F", HR: "F", RS: "F", SK: "F",
  SI: "F", RU: "F", TR: "F", UA: "F", BY: "F",
  AU: "G", NZ: "G",
  US: "H", CA: "H",
  BR: "I", AR: "I", CL: "I", CO: "I", PE: "I",
  MX: "J", GT: "J", PA: "J", CU: "J", DO: "J",
  // Hawaii separate from H — but vault doesn't distinguish, keep as H
  AE: "L", SA: "L", QA: "L", KW: "L", OM: "L",
  ZA: "L", ET: "L", KE: "L", NG: "L", EG: "L",
};

function getZone(cc) {
  return ZONE[cc] || null;
}

// CA own-metal chart — round-trip, halved for one-way
// [economy, business, first] — one-way values
const CA_OWN = {};
function co(a, b, e, biz, f) { CA_OWN[pairKey(a, b)] = [e, biz, f]; }

// China (A) — USA (H): 100K/200K/280K RT → 50K/100K/140K OW
co("A", "H", 50000, 100000, 140000);
// China (A) — Europe (F): 90K/180K/~250K RT → 45K/90K/125K OW
co("A", "F", 45000, 90000, 125000);
// Middle East/Africa (L) — Europe (F): 115K/256K/346K RT → 57.5K/128K/173K OW
co("L", "F", 57500, 128000, 173000);

// Star Alliance partner chart — round-trip, halved for one-way
const CA_PTR = {};
function cp(a, b, e, biz, f) { CA_PTR[pairKey(a, b)] = [e, biz, f]; }

// China — USA (H): 120K/238K/305K RT → 60K/119K/152.5K OW
cp("A", "H", 60000, 119000, 152500);
// China — Europe (F): 110K/206K/— RT → 55K/103K/— OW
cp("A", "F", 55000, 103000, null);
// USA — Hong Kong/Taipei (H–B): —/176K/220K RT → —/88K/110K OW
cp("H", "B", null, 88000, 110000);
// USA — Japan/Korea (H–C): —/160K/210K RT → —/80K/105K OW
cp("H", "C", null, 80000, 105000);
// USA — Oceania (H–G): —/188K/250K RT → —/94K/125K OW
cp("H", "G", null, 94000, 125000);

export const slug = "phoenixmiles";

export const bookable = BOOKABLE;

export function handle(legs) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, CA_CARRIERS);
  const entries = [];

  const oz = getZone(originCC);
  const dz = getZone(destCC);
  if (!oz || !dz) return [];

  const key = pairKey(oz, dz);

  // CA own-metal
  if (chart !== "partner") {
    const own = CA_OWN[key];
    if (own) {
      const [e, b, f] = own;
      const wrap = (v) => v === null ? null : [v, v];
      entries.push({
        programme: "phoenixmiles", chart: "own", season: "standard",
        economy: wrap(e), premium_economy: null, business: wrap(b), first: wrap(f),
      });
    }
  }

  // Star Alliance partner
  if (chart !== "own") {
    const ptr = CA_PTR[key];
    if (ptr) {
      const [e, b, f] = ptr;
      const wrap = (v) => v === null ? null : [v, v];
      entries.push({
        programme: "phoenixmiles", chart: "partner", season: "standard",
        economy: wrap(e), premium_economy: null, business: wrap(b), first: wrap(f),
      });
    }
  }

  return entries;
}
