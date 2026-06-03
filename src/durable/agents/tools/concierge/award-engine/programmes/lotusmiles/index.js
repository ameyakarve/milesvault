/**
 * Lotusmiles (Vietnam Airlines) — Itinerary-based chart
 *
 * VN own-metal: itinerary-based with regular and peak pricing.
 * Premium Economy available only on VN, not on partners.
 * SkyTeam partner: separate chart (no published rates in vault).
 * Multi-leg: per-segment additive.
 *
 * Source: vault Award Charts/Lotusmiles.md
 * HOW TO REFRESH: Update zone maps and charts below when full chart is published
 */

import { resolveChart } from "../../shared.js";

// SkyTeam members minus OK (Czech Airlines ceased operations)
const BOOKABLE = new Set(["AF","AM","AR","CI","DL","GA","KE","KL","KQ","ME","MF","MU","RO","SK","SV","UX","VN","VS"]);

const VN_CARRIERS = new Set(["VN"]);

// Zone mapping from Vietnam
const ZONE = {
  VN: "VN",
  // Southeast Asia
  TH: "SEA", SG: "SEA", MY: "SEA", ID: "SEA", PH: "SEA",
  KH: "SEA", MM: "SEA", LA: "SEA",
  // China / HK / NE Asia (excl Korea/Japan)
  CN: "CNE", HK: "CNE", TW: "CNE", MO: "CNE",
  // Korea
  KR: "KR",
  // Japan
  JP: "JP",
  // Australia
  AU: "AU", NZ: "AU",
  // Europe
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU",
  AT: "EU", IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU",
  IT: "EU", ES: "EU", PT: "EU", GR: "EU", PL: "EU", CZ: "EU",
  HU: "EU", RO: "EU", TR: "EU", RU: "EU",
  // Not in chart — fallback to null
};

function getZone(cc) {
  return ZONE[cc] || null;
}

// VN own-metal chart — one-way, regular period
// [economy, premEcon, business]
// Where vault shows ranges, use the midpoint or lower end
const VN_OWN = {
  VN:  [7500, null, null],          // Domestic
  SEA: [13000, null, null],         // Vietnam — Southeast Asia
  CNE: [17500, null, 30000],        // Vietnam — China/HK/NE Asia (15K–20K → 17.5K)
  KR:  [22000, null, 60000],        // Vietnam — Korea
  JP:  [null, null, 90000],         // Vietnam — Japan (no economy published)
  AU:  [null, 70000, 100000],       // Vietnam — Australia
  EU:  [null, 85000, 150000],       // Vietnam — Europe
};

export const bookable = BOOKABLE;

export function handle(legs) {
  const chart = resolveChart(legs, VN_CARRIERS);
  const entries = [];

  // VN own-metal — per-segment additive
  if (chart !== "partner") {
    let totalE = 0, totalPE = 0, totalB = 0;
    let hasE = false, hasPE = false, hasB = false;
    let allResolved = true;

    for (const leg of legs) {
      const oc = leg.origin_cc;
      const dc = leg.destination_cc;

      // Both ends Vietnam = domestic
      if (oc === "VN" && dc === "VN") {
        const row = VN_OWN["VN"];
        if (row[0] !== null) { totalE += row[0]; hasE = true; }
        if (row[2] !== null) { totalB += row[2]; hasB = true; }
        continue;
      }

      // One end must be VN
      const isVNOrigin = oc === "VN";
      const isVNDest = dc === "VN";
      if (!isVNOrigin && !isVNDest) { allResolved = false; continue; }

      const foreignCC = isVNOrigin ? dc : oc;
      const zone = getZone(foreignCC);
      if (!zone || !VN_OWN[zone]) { allResolved = false; continue; }

      const [e, pe, b] = VN_OWN[zone];
      if (e !== null) { totalE += e; hasE = true; }
      if (pe !== null) { totalPE += pe; hasPE = true; }
      if (b !== null) { totalB += b; hasB = true; }
    }

    if (hasE || hasPE || hasB) {
      const wrap = (has, v) => has ? [v, v] : null;
      entries.push({
        programme: "lotusmiles", chart: "own", season: "regular",
        economy: wrap(hasE, totalE),
        premium_economy: wrap(hasPE, totalPE),
        business: wrap(hasB, totalB),
        first: null,
      });
    }
  }

  // SkyTeam partner chart — no published rates in vault

  return entries;
}
