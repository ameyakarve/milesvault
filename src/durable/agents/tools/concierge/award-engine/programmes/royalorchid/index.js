/**
 * Royal Orchid Plus (Thai Airways) — Zone-based charts
 *
 * TG own-metal: zone-based from Bangkok (direct and connecting)
 * Partner (Star Alliance): 12-zone asymmetric matrix, one-way
 *
 * All partner chart values stored in tenths of thousands (e.g., 175 = 17,500 miles).
 * Multiply by 100 before returning.
 *
 * Source: vault Award Charts/Royal Orchid Plus/
 * HOW TO REFRESH: Update TG_DIRECT, TG_CONNECTING, PTR_* matrices below
 */

import { makeEntry, resolveChart } from "../../shared.js";

const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VL","ZH"]);

const TG_CARRIERS = new Set(["TG", "WE"]);

// TG own-metal zone mapping (from Bangkok)
const TG_ZONE = {
  TH: "DOM",
  KH: 1, LA: 1, MY: 1, MM: 1, SG: 1, VN: 1, BD: 1,
  HK: 2, TW: 2,
  ID: 3, PH: 3,
  IN: 4, NP: 4, LK: 4,
  JP: 5, KR: 5,
  PK: 6, SA: 6,
  AU: 7,
  NZ: 8,
  // Zone 9 = Europe
  BE: 9, DK: 9, FR: 9, DE: 9, IT: 9, NO: 9, SE: 9, CH: 9, TR: 9, GB: 9,
  AT: 9, NL: 9, ES: 9, PT: 9, FI: 9, IE: 9, GR: 9, PL: 9, CZ: 9, RU: 9,
};

const PERTH_AIRPORTS = new Set(["PER"]);

// TG Direct from Bangkok: [economy, premEcon, business, first]
// null = not available
const TG_DIRECT = {
  DOM:  [7500, 8750, null, null],
  1:    [12500, 15000, 20000, 35000],
  2:    [17500, 22500, 30000, 42500],
  3:    [17500, null, 27500, 35000],
  4:    [17500, 22500, 27500, 37500],
  5:    [22500, 30000, 47500, 67500],
  6:    [22500, null, 42500, 60000],
  7:    [27500, null, 65000, 90000],
  "7a": [22500, null, 47500, null],
  8:    [42500, null, 85000, 115000],
  9:    [42500, null, 90000, 125000],
};

// TG Connecting (domestic + international via Bangkok)
const TG_CONNECTING = {
  1: [16250, 19500, 25000, null],
  2: [21250, null, 35000, null],
  3: [21250, null, 32500, null],
  4: [21250, null, 32500, null],
  5: [26250, null, 52500, 75000],
  6: [26250, null, 47500, null],
  7: [31250, null, 70000, null],
  8: [46250, null, 90000, null],
  9: [46250, null, 95000, 132500],
};

// Partner chart zone mapping (12 zones)
const PTR_ZONE = {
  // Zone 1: Asia 1 (ASEAN + Thailand)
  KH: 1, LA: 1, MY: 1, MM: 1, SG: 1, TH: 1, VN: 1,
  // Zone 2: Asia 2 (Southern China, Indonesia, etc.)
  BN: 2, HK: 2, ID: 2, TW: 2, PH: 2,
  // Zone 3: South Asia
  BD: 3, BT: 3, IN: 3, MV: 3, NP: 3, LK: 3,
  // Zone 4: Northeast Asia
  JP: 4, KR: 4, MN: 4,
  // Zone 5: Central Asia / Middle East
  AM: 5, AZ: 5, BH: 5, EG: 5, GE: 5, IR: 5, IQ: 5, IL: 5, JO: 5,
  KZ: 5, KW: 5, KG: 5, LB: 5, OM: 5, PK: 5, QA: 5, SA: 5, SY: 5,
  TJ: 5, TM: 5, AE: 5, UZ: 5, YE: 5,
  // Zone 6: Australia / Pacific
  AU: 6, PG: 6,
  // Zone 7: New Zealand / Oceania
  NZ: 7, FJ: 7, NC: 7, WS: 7, TO: 7, VU: 7,
  // Zone 8: Hawaii / Pacific Islands (handled via airport)
  GU: 8,
  // Zone 9: Europe / North Africa
  GB: 9, FR: 9, DE: 9, NL: 9, BE: 9, CH: 9, AT: 9, IE: 9,
  DK: 9, SE: 9, NO: 9, FI: 9, IT: 9, ES: 9, PT: 9, GR: 9,
  PL: 9, RO: 9, BG: 9, CZ: 9, HU: 9, HR: 9, RS: 9, SK: 9, SI: 9,
  TR: 9, RU: 9, IS: 9, LT: 9, LV: 9, EE: 9, UA: 9, BY: 9,
  MA: 9, TN: 9, LY: 9, DZ: 9,
  // Zone 10: Sub-Saharan / Southern Africa
  ZA: 10, KE: 10, TZ: 10, ET: 10, NG: 10, GH: 10, UG: 10,
  MZ: 10, ZW: 10, ZM: 10, MW: 10, BW: 10, NA: 10, SN: 10,
  CI: 10, CM: 10, CD: 10, MG: 10, MU: 10,
  // Zone 11: North America / Caribbean
  US: 11, CA: 11, CU: 11, DO: 11, JM: 11, BS: 11, BB: 11, TT: 11, PR: 11,
  // Zone 12: Central / South America
  MX: 12, GT: 12, HN: 12, SV: 12, NI: 12, CR: 12, PA: 12, BZ: 12,
  BR: 12, AR: 12, CL: 12, CO: 12, PE: 12, EC: 12, VE: 12,
  BO: 12, PY: 12, UY: 12,
};

const HAWAII_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO"]);

function getPtrZone(cc, airport) {
  if (cc === "US" && HAWAII_AIRPORTS.has(airport)) return 8;
  return PTR_ZONE[cc] || null;
}

// CN is split: southern China (HK, Guangzhou, Shanghai, Chengdu) = Zone 2, Beijing = Zone 4
const CN_Z2_AIRPORTS = new Set(["HKG","CAN","PVG","SHA","CTU","SZX","KMG","XMN","CSX","WUH","CGO","NKG","HGH","TAO","SYX","HAK"]);
function getCnPtrZone(airport) {
  if (CN_Z2_AIRPORTS.has(airport)) return 2;
  return 4; // Beijing and northern China = Zone 4
}

// Partner award chart — asymmetric 12x12 matrices
// Values in hundreds (175 = 17,500 miles). Multiply by 100 to get actual miles.
// Indexed [fromZone-1][toZone-1]
const PTR_ECO = [
  [175, 225, 225, 300, 325, 375, 500, 500, 500, 550, 670, 730],
  [225, 175, 250, 250, 350, 375, 550, 550, 550, 550, 670, 730],
  [225, 250, 175, 350, 300, 425, 550, 625, 400, 350, 670, 730],
  [300, 250, 350, 175, 400, 450, 550, 350, 560, 650, 500, 500],
  [325, 350, 300, 400, 175, 450, 550, 750, 350, 300, 650, 700],
  [375, 375, 425, 450, 450, 175, 225, 350, 650, 800, 900, 900],
  [500, 550, 550, 550, 550, 225, 175, 300, 700, 950, 900, 900],
  [500, 550, 625, 350, 750, 350, 300, 175, 1050, 1050, 650, 650],
  [500, 550, 400, 560, 350, 650, 700, 1050, 175, 550, 550, 600],
  [550, 550, 350, 650, 300, 800, 950, 1050, 550, 175, 650, 600],
  [670, 670, 670, 500, 650, 900, 900, 650, 550, 650, 175, 350],
  [730, 730, 730, 500, 700, 900, 900, 650, 600, 600, 350, 175],
];

const PTR_PE = [
  [225, 275, 275, 375, 400, 450, 750, 750, 750, 750, 900, 1000],
  [275, 225, 300, 300, 450, 550, 750, 750, 800, 850, 900, 1000],
  [275, 300, 225, 475, 375, 550, 800, 900, 650, 600, 900, 1000],
  [375, 300, 475, 225, 575, 600, 900, 500, 900, 950, 750, 750],
  [400, 450, 375, 575, 225, 600, 900, 950, 550, 500, 850, 900],
  [900, 550, 550, 600, 600, 225, 275, 475, 900, 1050, 1350, 1350],
  [750, 750, 800, 900, 900, 275, 225, 350, 1000, 1250, 1100, 1100],
  [750, 750, 900, 500, 950, 475, 350, 225, 1350, 1350, 850, 850],
  [750, 800, 650, 900, 550, 900, 1000, 1350, 225, 750, 750, 800],
  [750, 850, 600, 950, 500, 1050, 1250, 1350, 750, 225, 850, 800],
  [900, 900, 900, 750, 850, 1350, 1100, 850, 750, 850, 225, 450],
  [1000, 1000, 1000, 750, 900, 1350, 1100, 850, 800, 800, 450, 225],
];

const PTR_BIZ = [
  [275, 350, 350, 575, 600, 600, 1000, 1150, 1050, 1150, 1320, 1430],
  [350, 275, 425, 425, 675, 875, 1050, 1150, 1150, 1250, 1320, 1430],
  [350, 425, 275, 650, 450, 900, 1075, 1250, 950, 850, 1320, 1430],
  [575, 425, 650, 275, 750, 1050, 1250, 750, 1250, 1500, 1100, 1100],
  [600, 675, 450, 750, 275, 1050, 1250, 1350, 750, 700, 1500, 1550],
  [750, 875, 900, 1050, 1050, 275, 500, 650, 1400, 1750, 2000, 2000],
  [1000, 1050, 1075, 1250, 1250, 500, 275, 500, 1500, 1850, 2050, 2050],
  [1150, 1150, 1250, 750, 1350, 650, 500, 275, 2000, 2000, 1050, 1050],
  [1050, 1150, 950, 1250, 750, 1400, 1500, 2000, 275, 825, 825, 900],
  [1150, 1250, 850, 1500, 700, 1750, 1850, 2000, 825, 275, 1050, 1000],
  [1320, 1320, 1320, 1100, 1500, 2000, 2050, 1050, 825, 1050, 275, 650],
  [1430, 1430, 1430, 1100, 1550, 2000, 2050, 1050, 900, 1000, 650, 275],
];

const PTR_FIRST = [
  [400, 475, 475, 800, 850, 1150, 1250, 1600, 1550, 1600, 1800, 1900],
  [475, 350, 650, 650, 800, 1200, 1400, 1600, 1625, 1750, 1800, 1900],
  [475, 650, 350, 900, 650, 1250, 1500, 1700, 1500, 1400, 1800, 1900],
  [800, 650, 900, 350, 1050, 1450, 1700, 1050, 1750, 1900, 1550, 1550],
  [850, 800, 650, 1050, 350, 1450, 1700, 1750, 1300, 1150, 2000, 2050],
  [1150, 1200, 1250, 1450, 1450, 350, 950, 1050, 1950, 2250, 2500, 2500],
  [1250, 1400, 1500, 1700, 1700, 950, 350, 950, 2000, 2250, 2500, 2500],
  [1600, 1600, 1700, 1050, 1750, 1050, 950, 350, 2400, 2400, 1450, 1450],
  [1550, 1625, 1500, 1750, 1300, 1950, 2000, 2400, 350, 1000, 1000, 1020],
  [1600, 1750, 1400, 1900, 1150, 2250, 2250, 2400, 1000, 350, 1450, 1400],
  [1800, 1800, 1800, 1550, 2000, 2500, 2500, 1450, 1000, 1450, 350, 900],
  [1900, 1900, 1900, 1550, 2050, 2500, 2500, 1450, 1020, 1400, 900, 350],
];

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, TG_CARRIERS);
  const entries = [];

  // TG own-metal chart
  if (chart !== "partner") {
    // Determine if Bangkok is one endpoint
    const isTHOrigin = originCC === "TH";
    const isTHDest = destCC === "TH";

    if (isTHOrigin || isTHDest) {
      const foreignCC = isTHOrigin ? destCC : originCC;
      let zone = TG_ZONE[foreignCC];

      if (foreignCC === "TH") zone = "DOM";
      // Perth special zone
      if (foreignCC === "AU") {
        const destApt = isTHOrigin ? legs[legs.length - 1].destination : legs[0].origin;
        if (PERTH_AIRPORTS.has(destApt)) zone = "7a";
      }
      // CN split for TG zone
      if (foreignCC === "CN") {
        // Southern China (Kunming) = Zone 1, others = Zone 2 or 5
        // Simplified: Kunming airports in zone 1 already handled via BD in zone 1
        zone = 2; // Default to zone 2 for China
      }

      if (zone !== undefined && zone !== null) {
        // Check if connecting (domestic TH + international)
        const hasDomestic = legs.length > 1 && legs.some((l) =>
          l.origin_cc === "TH" && l.destination_cc === "TH"
        );
        const chartData = (hasDomestic && zone !== "DOM") ? TG_CONNECTING[zone] : TG_DIRECT[zone];

        if (chartData) {
          const [e, pe, b, f] = chartData;
          const wrap = (v) => v === null || v === undefined ? null : [v, v];
          entries.push({
            programme: "royalorchid", chart: "tg_operated", season: "default",
            economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: wrap(f),
          });
        }
      }
    }
  }

  // Partner chart (Star Alliance)
  if (chart !== "own") {
    let oz, dz;

    // Handle CN zone split
    if (originCC === "CN") {
      oz = getCnPtrZone(legs[0].origin);
    } else {
      oz = getPtrZone(originCC, legs[0].origin);
    }

    if (destCC === "CN") {
      dz = getCnPtrZone(legs[legs.length - 1].destination);
    } else {
      dz = getPtrZone(destCC, legs[legs.length - 1].destination);
    }

    if (oz && dz) {
      const i = oz - 1, j = dz - 1;
      const e = PTR_ECO[i]?.[j];
      const pe = PTR_PE[i]?.[j];
      const b = PTR_BIZ[i]?.[j];
      const f = PTR_FIRST[i]?.[j];

      if (e !== undefined) {
        const wrap = (v) => v != null ? [v * 100, v * 100] : null;
        entries.push({
          programme: "royalorchid", chart: "partner", season: "default",
          economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: wrap(f),
        });
      }
    }
  }

  return entries;
}
