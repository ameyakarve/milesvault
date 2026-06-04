/**
 * Egret Club (Xiamen Airlines) — Distance-based / Route-based chart
 *
 * MF own-metal: route-based (international) and distance-based (domestic).
 *   Premium Economy available on short-haul international only.
 *
 * SkyTeam partner: distance-based chart (km) with 1:2:2.5 ratio (Economy:Business:First).
 *   8 distance tiers for international routes.
 *
 * Multi-leg: per-segment pricing.
 *
 * Source: vault Award Charts/Egret Club.md
 * HOW TO REFRESH: Update charts below
 */

import { resolveChart, resolveBand } from "../../shared.js";

// SkyTeam members minus OK (Czech Airlines ceased operations)
const BOOKABLE = new Set(["AF","AM","AR","AZ","CI","DL","GA","KE","KL","KQ","ME","MF","MU","RO","SK","SV","UX","VN","VS"]);

const MF_CARRIERS = new Set(["MF"]);

// ==================================
// Xiamen group — domestic (distance-based, one-way)
// ==================================
// Distance bands in km
const MF_DOM_BANDS = [500, 1000, 1500, 2000, 3000, Infinity];
// [economy, premEcon, business, first]
const MF_DOM = [
  [5000,  6000,  9000,  10000],
  [9000,  11000, 16000, 18000],
  [13000, 16000, 23000, 26000],
  [18000, 22000, 32000, 36000],
  [23000, 28000, 41000, 46000],
  [28000, 34000, 50000, 56000],
];

// ==================================
// Xiamen group — international / regional routes (one-way)
// ==================================
// Route-based from China (key = route category)
const MF_INTL = {
  HKMACTW:  [20000, 24000, 26000, 36000],
  JPKR:     [25000, 30000, 32500, 45000],
  SEA:      [30000, 36000, 39000, 54000],
  S_ASIA:   [40000, null,  60000, 80000],
  OCEANIA:  [40000, null,  60000, 80000],
  M_EAST:   [40000, null,  60000, 80000],
  EUROPE:   [50000, null,  80000, 120000],
  N_AM:     [60000, null,  110000, 155000],
};

// Route zone mapping for own-metal international
const MF_ROUTE_ZONE = {
  HK: "HKMACTW", MO: "HKMACTW", TW: "HKMACTW",
  JP: "JPKR", KR: "JPKR",
  TH: "SEA", SG: "SEA", MY: "SEA", ID: "SEA", PH: "SEA",
  VN: "SEA", MM: "SEA", KH: "SEA", LA: "SEA", BN: "SEA",
  IN: "S_ASIA", BD: "S_ASIA", NP: "S_ASIA", LK: "S_ASIA", PK: "S_ASIA",
  AU: "OCEANIA", NZ: "OCEANIA",
  AE: "M_EAST", SA: "M_EAST", QA: "M_EAST", KW: "M_EAST", OM: "M_EAST",
  IL: "M_EAST", JO: "M_EAST",
  GB: "EUROPE", FR: "EUROPE", DE: "EUROPE", NL: "EUROPE", BE: "EUROPE",
  CH: "EUROPE", AT: "EUROPE", IE: "EUROPE", DK: "EUROPE", SE: "EUROPE",
  NO: "EUROPE", FI: "EUROPE", IT: "EUROPE", ES: "EUROPE", PT: "EUROPE",
  GR: "EUROPE", PL: "EUROPE", CZ: "EUROPE", HU: "EUROPE", RO: "EUROPE",
  TR: "EUROPE", RU: "EUROPE",
  US: "N_AM", CA: "N_AM",
};

// ==================================
// Partner — domestic (distance-based, one-way)
// ==================================
const PTR_DOM_BANDS = [500, 1000, 1500, 2000, 3000, Infinity];
// [economy, business, first]
const PTR_DOM = [
  [6000,  12000, 15000],
  [11000, 22000, 27500],
  [15000, 30000, 37500],
  [20000, 40000, 50000],
  [25000, 50000, 62500],
  [29000, 56000, 70000],
];

// ==================================
// Partner — international (distance-based in km, one-way)
// ==================================
const PTR_INTL_BANDS = [1000, 1500, 2000, 3000, 5000, 7000, 10000, Infinity];
// [economy, business, first]
const PTR_INTL = [
  [13000,  26000,  32500],
  [19000,  38000,  47500],
  [25000,  50000,  62500],
  [31000,  62000,  77500],
  [42000,  84000,  105000],
  [50000,  100000, 125000],
  [70000,  140000, 175000],
  [85000,  170000, 212500],
];

// Convert statute miles to km (haversine returns statute miles)
function milesToKm(miles) {
  return miles * 1.60934;
}

export const slug = "egret-club";

export const bookable = BOOKABLE;

export function handle(legs) {
  const chart = resolveChart(legs, MF_CARRIERS);
  const entries = [];

  // MF own-metal — per-segment
  if (chart !== "partner") {
    let totalE = 0, totalPE = 0, totalB = 0, totalF = 0;
    let hasE = false, hasPE = false, hasB = false, hasF = false;
    let allResolved = true;

    for (const leg of legs) {
      const oc = leg.origin_cc;
      const dc = leg.destination_cc;
      const distKm = milesToKm(leg.distance);

      // Both ends China = domestic
      if (oc === "CN" && dc === "CN") {
        const band = resolveBand(distKm, MF_DOM_BANDS);
        const [e, pe, b, f] = MF_DOM[band];
        totalE += e; hasE = true;
        if (pe !== null) { totalPE += pe; hasPE = true; }
        totalB += b; hasB = true;
        totalF += f; hasF = true;
        continue;
      }

      // International: one end must be China
      const isCNOrigin = oc === "CN";
      const isCNDest = dc === "CN";
      if (!isCNOrigin && !isCNDest) { allResolved = false; continue; }

      const foreignCC = isCNOrigin ? dc : oc;
      const routeZone = MF_ROUTE_ZONE[foreignCC];
      if (!routeZone || !MF_INTL[routeZone]) { allResolved = false; continue; }

      const [e, pe, b, f] = MF_INTL[routeZone];
      if (e !== null) { totalE += e; hasE = true; }
      if (pe !== null) { totalPE += pe; hasPE = true; }
      if (b !== null) { totalB += b; hasB = true; }
      if (f !== null) { totalF += f; hasF = true; }
    }

    if (hasE || hasPE || hasB || hasF) {
      const wrap = (has, v) => has ? [v, v] : null;
      entries.push({
        programme: "egretclub", chart: "own", season: "default",
        economy: wrap(hasE, totalE),
        premium_economy: wrap(hasPE, totalPE),
        business: wrap(hasB, totalB),
        first: wrap(hasF, totalF),
      });
    }
  }

  // SkyTeam partner — distance-based per-segment
  if (chart !== "own") {
    let totalE = 0, totalB = 0, totalF = 0;
    let hasE = false, hasB = false, hasF = false;

    for (const leg of legs) {
      const distKm = milesToKm(leg.distance);
      const isDomestic = leg.origin_cc === leg.destination_cc;

      if (isDomestic) {
        const band = resolveBand(distKm, PTR_DOM_BANDS);
        const [e, b, f] = PTR_DOM[band];
        totalE += e; hasE = true;
        totalB += b; hasB = true;
        totalF += f; hasF = true;
      } else {
        const band = resolveBand(distKm, PTR_INTL_BANDS);
        const [e, b, f] = PTR_INTL[band];
        totalE += e; hasE = true;
        totalB += b; hasB = true;
        totalF += f; hasF = true;
      }
    }

    if (hasE || hasB || hasF) {
      const wrap = (has, v) => has ? [v, v] : null;
      entries.push({
        programme: "egretclub", chart: "partner", season: "default",
        economy: wrap(hasE, totalE),
        premium_economy: null,
        business: wrap(hasB, totalB),
        first: wrap(hasF, totalF),
      });
    }
  }

  return entries;
}
