/**
 * ConnectMiles (Copa Airlines) — Zone-based charts
 *
 * Copa own-metal: zone-based with Saver and Standard tiers
 * Partner (Star Alliance): fixed route-based chart, round-trip (60% for one-way)
 *
 * Source: vault Award Charts/ConnectMiles.md
 * HOW TO REFRESH: Update zone maps and charts below
 */

import { resolveChart, pairKey } from "../../shared.js";

const BOOKABLE = new Set(["A3","AC","AD","AI","AV","BR","CA","CM","EK","ET","G3","KL","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VL","ZH"]);

const CM_CARRIERS = new Set(["CM"]);

// Copa own-metal zone mapping
const CM_ZONE = {
  // North America 1 cities (by airport)
  US: "NAM1", CA: "NAM1",
  // Mexico
  MX: "MEX",
  // Panama
  PA: "PAN",
  // Central America
  CR: "CAM", SV: "CAM", GT: "CAM", HN: "CAM", NI: "CAM",
  // Caribbean 1
  BS: "CB1", BB: "CB1", BM: "CB1", CU: "CB1", CW: "CB1",
  DO: "CB1", HT: "CB1", JM: "CB1", PR: "CB1", TT: "CB1",
  // Caribbean 2
  GY: "CB2", SR: "CB2",
  // Northern South America
  CO: "NSA", EC: "NSA", PE: "NSA", VE: "NSA",
  // Southern South America
  AR: "SSA", CL: "SSA", PY: "SSA", UY: "SSA",
  // South America Dreams (Brazil)
  BR: "SAD",
};

// Toronto = NAM2
const NAM2_AIRPORTS = new Set(["YYZ","YTZ"]);

function getCmZone(cc, airport) {
  if (cc === "CA" && NAM2_AIRPORTS.has(airport)) return "NAM2";
  return CM_ZONE[cc] || null;
}

// Copa own economy saver chart — one-way
// Key = pairKey(originZone, destZone), Value = miles
const CM_ECO_S = {};
function es(a, b, v) { CM_ECO_S[pairKey(a, b)] = v; }
es("NAM1","MEX",17500); es("NAM1","PAN",15000); es("NAM1","CAM",15000);
es("NAM1","CB1",15000); es("NAM1","CB2",30000); es("NAM1","NSA",15000);
es("NAM1","SSA",25000); es("NAM1","SAD",25000);
es("NAM2","MEX",17500); es("NAM2","PAN",20000); es("NAM2","CAM",20000);
es("NAM2","CB1",20000); es("NAM2","CB2",40000); es("NAM2","NSA",20000);
es("NAM2","SSA",35000); es("NAM2","SAD",35000);
es("MEX","PAN",10000); es("MEX","CAM",10000); es("MEX","CB1",12500);
es("MEX","CB2",25000); es("MEX","NSA",12500); es("MEX","SSA",20000);
es("MEX","SAD",20000);
es("PAN","PAN",5000); es("PAN","CAM",7500); es("PAN","CB1",7500);
es("PAN","CB2",15000); es("PAN","NSA",10000); es("PAN","SSA",20000);
es("PAN","SAD",20000);
es("CAM","CAM",7500); es("CAM","CB1",10000); es("CAM","CB2",20000);
es("CAM","NSA",10000); es("CAM","SSA",20000); es("CAM","SAD",20000);
es("CB1","CB1",10000); es("CB1","CB2",20000); es("CB1","NSA",10000);
es("CB1","SSA",20000); es("CB1","SAD",20000);
es("CB2","CB2",20000); es("CB2","NSA",40000); es("CB2","SSA",40000);
es("NSA","NSA",10000); es("NSA","SSA",20000); es("NSA","SAD",20000);

// Copa own economy standard
const CM_ECO_X = {};
function ex(a, b, v) { CM_ECO_X[pairKey(a, b)] = v; }
ex("NAM1","MEX",30000); ex("NAM1","PAN",30000); ex("NAM1","CAM",30000);
ex("NAM1","CB1",30000); ex("NAM1","CB2",60000); ex("NAM1","NSA",30000);
ex("NAM1","SSA",50000); ex("NAM1","SAD",50000);
ex("NAM2","MEX",30000); ex("NAM2","PAN",40000); ex("NAM2","CAM",40000);
ex("NAM2","CB1",40000); ex("NAM2","CB2",80000); ex("NAM2","NSA",40000);
ex("NAM2","SSA",70000); ex("NAM2","SAD",70000);
ex("MEX","PAN",20000); ex("MEX","CAM",20000); ex("MEX","CB1",25000);
ex("MEX","CB2",50000); ex("MEX","NSA",25000); ex("MEX","SSA",40000);
ex("MEX","SAD",40000);
ex("PAN","PAN",10000); ex("PAN","CAM",15000); ex("PAN","CB1",15000);
ex("PAN","CB2",30000); ex("PAN","NSA",20000); ex("PAN","SSA",40000);
ex("PAN","SAD",40000);
ex("CAM","CAM",15000); ex("CAM","CB1",20000); ex("CAM","CB2",40000);
ex("CAM","NSA",20000); ex("CAM","SSA",40000); ex("CAM","SAD",40000);
ex("CB1","CB1",20000); ex("CB1","CB2",50000); ex("CB1","NSA",25000);
ex("CB1","SSA",40000); ex("CB1","SAD",40000);
ex("CB2","CB2",50000); ex("CB2","NSA",80000); ex("CB2","SSA",80000);
ex("NSA","NSA",15000); ex("NSA","SSA",40000); ex("NSA","SAD",40000);

// Copa own business saver
const CM_BIZ_S = {};
function bs(a, b, v) { CM_BIZ_S[pairKey(a, b)] = v; }
bs("NAM1","MEX",30000); bs("NAM1","PAN",30000); bs("NAM1","CAM",30000);
bs("NAM1","CB1",30000); bs("NAM1","CB2",60000); bs("NAM1","NSA",35000);
bs("NAM1","SSA",55000); bs("NAM1","SAD",70000);
bs("NAM2","MEX",30000); bs("NAM2","PAN",40000); bs("NAM2","CAM",40000);
bs("NAM2","CB1",40000); bs("NAM2","CB2",80000); bs("NAM2","NSA",40000);
bs("NAM2","SSA",65000); bs("NAM2","SAD",80000);
// North America Dreams for biz only
bs("MEX","PAN",20000); bs("MEX","CAM",20000); bs("MEX","CB1",25000);
bs("MEX","CB2",50000); bs("MEX","NSA",25000); bs("MEX","SSA",40000);
bs("MEX","SAD",50000);
bs("PAN","PAN",10000); bs("PAN","CAM",20000); bs("PAN","CB1",20000);
bs("PAN","CB2",40000); bs("PAN","NSA",20000); bs("PAN","SSA",40000);
bs("PAN","SAD",50000);
bs("CAM","CAM",20000); bs("CAM","CB1",20000); bs("CAM","CB2",40000);
bs("CAM","NSA",20000); bs("CAM","SSA",40000); bs("CAM","SAD",50000);
bs("CB1","CB1",25000); bs("CB1","CB2",50000); bs("CB1","NSA",25000);
bs("CB1","SSA",40000); bs("CB1","SAD",50000);
bs("CB2","CB2",50000); bs("CB2","NSA",80000); bs("CB2","SSA",100000);
bs("NSA","NSA",20000); bs("NSA","SSA",40000); bs("NSA","SAD",50000);

// Copa own business standard
const CM_BIZ_X = {};
function bx(a, b, v) { CM_BIZ_X[pairKey(a, b)] = v; }
bx("NAM1","MEX",70000); bx("NAM1","PAN",70000); bx("NAM1","CAM",70000);
bx("NAM1","CB1",70000); bx("NAM1","CB2",140000); bx("NAM1","NSA",80000);
bx("NAM1","SSA",120000); bx("NAM1","SAD",150000);
bx("NAM2","MEX",70000); bx("NAM2","PAN",80000); bx("NAM2","CAM",80000);
bx("NAM2","CB1",80000); bx("NAM2","CB2",160000); bx("NAM2","NSA",85000);
bx("NAM2","SSA",135000); bx("NAM2","SAD",165000);
bx("MEX","PAN",40000); bx("MEX","CAM",40000); bx("MEX","CB1",50000);
bx("MEX","CB2",100000); bx("MEX","NSA",50000); bx("MEX","SSA",80000);
bx("MEX","SAD",100000);
bx("PAN","PAN",15000); bx("PAN","CAM",40000); bx("PAN","CB1",40000);
bx("PAN","CB2",80000); bx("PAN","NSA",40000); bx("PAN","SSA",80000);
bx("PAN","SAD",100000);
bx("CAM","CAM",40000); bx("CAM","CB1",40000); bx("CAM","CB2",80000);
bx("CAM","NSA",40000); bx("CAM","SSA",80000); bx("CAM","SAD",100000);
bx("CB1","CB1",45000); bx("CB1","CB2",90000); bx("CB1","NSA",45000);
bx("CB1","SSA",80000); bx("CB1","SAD",100000);
bx("CB2","CB2",90000); bx("CB2","NSA",160000); bx("CB2","SSA",200000);
bx("NSA","NSA",40000); bx("NSA","SSA",80000); bx("NSA","SAD",100000);

// Partner chart zones (Star Alliance)
const PTR_ZONE = {
  US: "US_CA", CA: "US_CA",
  // Hawaii handled via airport
  IN: "SA", BD: "SA", LK: "SA", NP: "SA", PK: "SA", MV: "SA",
  AU: "AU_NZ", NZ: "AU_NZ",
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", IT: "EU", ES: "EU",
  PT: "EU", CH: "EU", AT: "EU", SE: "EU", NO: "EU", DK: "EU",
  FI: "EU", IE: "EU", BE: "EU", GR: "EU", PL: "EU", CZ: "EU",
  HU: "EU", RO: "EU", TR: "EU", RU: "EU",
  JP: "NA_ASIA", KR: "NA_ASIA", CN: "NA_ASIA", HK: "NA_ASIA", TW: "NA_ASIA",
  AE: "ME", SA: "ME", QA: "ME", KW: "ME", BH: "ME", OM: "ME",
  IL: "ME", JO: "ME", EG: "ME",
};

const HAWAII_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO"]);

function getPtrZone(cc, airport) {
  if (cc === "US" && HAWAII_AIRPORTS.has(airport)) return "HI";
  return PTR_ZONE[cc] || null;
}

// Partner chart — round-trip values. One-way = 60% of RT.
// [economy_rt, business_rt, first_rt]
const PTR = {};
function pt(a, b, e, biz, f) { PTR[pairKey(a, b)] = [e, biz, f]; }
pt("US_CA","US_CA", 25000, 50000, 70000);
pt("US_CA","HI", 45000, 80000, 100000);
pt("US_CA","EU", 60000, 140000, 220000);
pt("US_CA","NA_ASIA", 70000, 160000, 240000);
pt("US_CA","ME", 85000, 160000, 280000);
pt("US_CA","AU_NZ", 80000, 160000, 260000);
pt("SA","AU_NZ", 35000, 60000, 80000);

export const slug = "connectmiles";

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, CM_CARRIERS);
  const entries = [];

  // Copa own-metal
  if (chart !== "partner") {
    const oz = getCmZone(originCC, legs[0].origin);
    const dz = getCmZone(destCC, legs[legs.length - 1].destination);

    if (oz && dz) {
      const key = pairKey(oz, dz);

      // Economy saver + standard
      const ecoS = CM_ECO_S[key];
      const ecoX = CM_ECO_X[key];
      // Business saver + standard
      const bizS = CM_BIZ_S[key];
      const bizX = CM_BIZ_X[key];

      if (ecoS !== undefined || bizS !== undefined) {
        // Saver
        entries.push({
          programme: "connectmiles", chart: "own_saver", season: "Saver",
          economy: ecoS ? [ecoS, ecoS] : null,
          premium_economy: null,
          business: bizS ? [bizS, bizS] : null,
          first: null,
        });
      }
      if (ecoX !== undefined || bizX !== undefined) {
        // Standard
        entries.push({
          programme: "connectmiles", chart: "own_standard", season: "Standard",
          economy: ecoX ? [ecoX, ecoX] : null,
          premium_economy: null,
          business: bizX ? [bizX, bizX] : null,
          first: null,
        });
      }
    }
  }

  // Star Alliance partner chart
  if (chart !== "own") {
    const oz = getPtrZone(originCC, legs[0].origin);
    const dz = getPtrZone(destCC, legs[legs.length - 1].destination);

    if (oz && dz) {
      const key = pairKey(oz, dz);
      const rt = PTR[key];

      if (rt) {
        const [e, biz, f] = rt;
        // One-way = 60% of round-trip
        const ow = (v) => v ? [Math.round(v * 0.6), Math.round(v * 0.6)] : null;
        entries.push({
          programme: "connectmiles", chart: "partner", season: "default",
          economy: ow(e), premium_economy: null, business: ow(biz), first: ow(f),
        });
      }
    }
  }

  return entries;
}
