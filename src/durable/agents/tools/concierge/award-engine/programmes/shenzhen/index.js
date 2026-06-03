/**
 * Shenzhen Phoenix Miles — Uses Air China PhoenixMiles chart
 *
 * ZH is a subsidiary of Air China. Shenzhen Airlines uses the same
 * PhoenixMiles award chart as Air China. Since both programmes share
 * the same pricing, this module delegates to the phoenixmiles chart
 * but outputs under the "shenzhen" programme name.
 *
 * The vault Shenzhen Phoenix Miles award chart file explicitly references
 * the Air China PhoenixMiles chart for all pricing.
 *
 * Star Alliance bookable airlines: same subset as PhoenixMiles.
 * Only limited route data is published in the vault.
 *
 * Source: vault Award Charts/Shenzhen Phoenix Miles.md
 * HOW TO REFRESH: Update if Shenzhen diverges from Air China chart
 */

import { resolveChart, pairKey } from "../../shared.js";

// Star Alliance (26)
const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VL","ZH"]);

const ZH_CARRIERS = new Set(["ZH"]);

// Same 12-zone mapping as Air China PhoenixMiles
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
  AE: "L", SA: "L", QA: "L", KW: "L", OM: "L",
  ZA: "L", ET: "L", KE: "L", NG: "L", EG: "L",
};

function getZone(cc) {
  return ZONE[cc] || null;
}

// Same pricing as Air China PhoenixMiles — own-metal one-way
const ZH_OWN = {};
function zo(a, b, e, biz, f) { ZH_OWN[pairKey(a, b)] = [e, biz, f]; }

zo("A", "H", 50000, 100000, 140000);
zo("A", "F", 45000, 90000, 125000);
zo("L", "F", 57500, 128000, 173000);

// Same pricing as Air China PhoenixMiles — partner one-way
const ZH_PTR = {};
function zp(a, b, e, biz, f) { ZH_PTR[pairKey(a, b)] = [e, biz, f]; }

zp("A", "H", 60000, 119000, 152500);
zp("A", "F", 55000, 103000, null);
zp("H", "B", null, 88000, 110000);
zp("H", "C", null, 80000, 105000);
zp("H", "G", null, 94000, 125000);

export const bookable = BOOKABLE;

export function handle(legs) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, ZH_CARRIERS);
  const entries = [];

  const oz = getZone(originCC);
  const dz = getZone(destCC);
  if (!oz || !dz) return [];

  const key = pairKey(oz, dz);

  // ZH own-metal (same chart as Air China)
  if (chart !== "partner") {
    const own = ZH_OWN[key];
    if (own) {
      const [e, b, f] = own;
      const wrap = (v) => v === null ? null : [v, v];
      entries.push({
        programme: "shenzhen", chart: "own", season: "standard",
        economy: wrap(e), premium_economy: null, business: wrap(b), first: wrap(f),
      });
    }
  }

  // Star Alliance partner
  if (chart !== "own") {
    const ptr = ZH_PTR[key];
    if (ptr) {
      const [e, b, f] = ptr;
      const wrap = (v) => v === null ? null : [v, v];
      entries.push({
        programme: "shenzhen", chart: "partner", season: "standard",
        economy: wrap(e), premium_economy: null, business: wrap(b), first: wrap(f),
      });
    }
  }

  return entries;
}
