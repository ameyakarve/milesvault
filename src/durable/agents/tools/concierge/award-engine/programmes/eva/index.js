/**
 * Infinity MileageLands (EVA Air) — Zone-based chart
 *
 * BR own-metal: zone-based from Taiwan, no seasonal variation.
 *   All prices round-trip; one-way = 50%. No First class on EVA.
 *   Chicago (ORD), New York (JFK), Houston (IAH), Toronto (YYZ) cost 10K more.
 *
 * Star Alliance partner: 14-zone matrix, no Premium Economy.
 *   All prices round-trip; one-way = 50%.
 *
 * Source: vault Award Charts/Infinity MileageLands/
 * HOW TO REFRESH: Update zone maps and charts below
 */

import { resolveChart, pairKey } from "../../shared.js";

// Star Alliance (26)
const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VL","ZH"]);

const BR_CARRIERS = new Set(["BR"]);

// =============================================
// EVA Air own-metal chart (from Taiwan)
// =============================================

// Zone mapping for own-metal (simplified — routes are from Asia)
const BR_ZONE = {
  TW: "TW",
  HK: "HKMAC", MO: "HKMAC",
  CN: "ASIA", JP: "ASIA", KR: "ASIA",
  TH: "ASIA", SG: "ASIA", MY: "ASIA", ID: "ASIA", PH: "ASIA",
  VN: "ASIA", MM: "ASIA", KH: "ASIA", LA: "ASIA", BN: "ASIA",
  IN: "ASIA", BD: "ASIA", NP: "ASIA", LK: "ASIA", PK: "ASIA",
  AU: "OC", NZ: "OC",
  US: "AM", CA: "AM", MX: "AM",
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU",
  AT: "EU", IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU",
  IT: "EU", ES: "EU", PT: "EU", GR: "EU", PL: "EU", CZ: "EU",
  HU: "EU", RO: "EU", BG: "EU", HR: "EU", TR: "EU", RU: "EU",
};

// Airports with surcharge for America routes (+10K RT → +5K OW each cabin)
const AM_SURCHARGE_AIRPORTS = new Set(["ORD", "JFK", "IAH", "YYZ"]);

// Own-metal one-way chart (half of round-trip)
// [economy, premEcon, business] — no First on EVA
const BR_OWN = {};
function bo(a, b, e, pe, biz) { BR_OWN[pairKey(a, b)] = [e, pe, biz]; }

// TW domestic (UNI Air only) — 13,500 RT → 6,750 OW
bo("TW", "TW", 6750, null, null);
// TW — HK/Macau — 20K RT → 10K OW
bo("TW", "HKMAC", 10000, null, 25000);
// Within Asia — 35K RT → 17.5K OW
bo("ASIA", "ASIA", 17500, 20000, 25000);
bo("TW", "ASIA", 17500, 20000, 25000);
bo("HKMAC", "ASIA", 17500, 20000, 25000);
// Asia — Oceania — 100K RT → 50K OW
bo("TW", "OC", 50000, null, 75000);
bo("ASIA", "OC", 50000, null, 75000);
bo("HKMAC", "OC", 50000, null, 75000);
// Asia — America (base) — 100K RT → 50K OW
bo("TW", "AM", 50000, 55000, 75000);
bo("ASIA", "AM", 50000, 55000, 75000);
bo("HKMAC", "AM", 50000, 55000, 75000);
// Asia — Europe — 100K RT → 50K OW
bo("TW", "EU", 50000, 55000, 75000);
bo("ASIA", "EU", 50000, 55000, 75000);
bo("HKMAC", "EU", 50000, 55000, 75000);

// =============================================
// Star Alliance partner chart (14 zones)
// =============================================

const PTR_ZONE = {
  TW: "TW",
  HK: "HK_MAC", MO: "HK_MAC",
  CN: "CHINA",
  JP: "N_ASIA", KR: "N_ASIA", GU: "N_ASIA", MH: "N_ASIA", PW: "N_ASIA", MN: "N_ASIA",
  TH: "SE_ASIA", SG: "SE_ASIA", MY: "SE_ASIA", ID: "SE_ASIA", PH: "SE_ASIA",
  VN: "SE_ASIA", MM: "SE_ASIA", KH: "SE_ASIA", LA: "SE_ASIA", BN: "SE_ASIA",
  IN: "CS_ASIA", BD: "CS_ASIA", NP: "CS_ASIA", LK: "CS_ASIA", PK: "CS_ASIA",
  MV: "CS_ASIA", AF: "CS_ASIA", KZ: "CS_ASIA", KG: "CS_ASIA", TJ: "CS_ASIA",
  TM: "CS_ASIA", UZ: "CS_ASIA",
  AU: "SW_PAC", NZ: "SW_PAC", FJ: "SW_PAC", WS: "SW_PAC", TO: "SW_PAC",
  US: "N_AM", CA: "N_AM",
  MX: "HI_CAM", GT: "HI_CAM", HN: "HI_CAM", SV: "HI_CAM", NI: "HI_CAM",
  CR: "HI_CAM", PA: "HI_CAM", CU: "HI_CAM", DO: "HI_CAM", JM: "HI_CAM",
  BS: "HI_CAM", BB: "HI_CAM", TT: "HI_CAM", BZ: "HI_CAM", HT: "HI_CAM",
  PR: "HI_CAM", BM: "HI_CAM",
  BR: "S_AM", AR: "S_AM", CL: "S_AM", CO: "S_AM", PE: "S_AM",
  VE: "S_AM", EC: "S_AM", BO: "S_AM", PY: "S_AM", UY: "S_AM",
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU",
  AT: "EU", IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU",
  IT: "EU", ES: "EU", PT: "EU", GR: "EU", PL: "EU", CZ: "EU",
  HU: "EU", RO: "EU", BG: "EU", HR: "EU", RS: "EU", SK: "EU",
  SI: "EU", BA: "EU", ME: "EU", MK: "EU", AL: "EU", UA: "EU",
  RU: "EU", TR: "EU", IS: "EU", LT: "EU", LV: "EU", EE: "EU",
  MT: "EU", LU: "EU",
  AE: "M_EAST", SA: "M_EAST", QA: "M_EAST", BH: "M_EAST", KW: "M_EAST",
  OM: "M_EAST", JO: "M_EAST", LB: "M_EAST", IQ: "M_EAST", IR: "M_EAST",
  IL: "M_EAST", YE: "M_EAST", SY: "M_EAST", EG: "M_EAST", CY: "M_EAST",
  GE: "M_EAST", AM: "M_EAST", AZ: "M_EAST",
  MA: "N_AF", TN: "N_AF", DZ: "N_AF", LY: "N_AF",
  ZA: "CS_AF", KE: "CS_AF", ET: "CS_AF", TZ: "CS_AF", UG: "CS_AF",
  NG: "CS_AF", GH: "CS_AF", SN: "CS_AF", CI: "CS_AF", CM: "CS_AF",
  MZ: "CS_AF", ZW: "CS_AF", ZM: "CS_AF", MW: "CS_AF", BW: "CS_AF",
  NA: "CS_AF", MG: "CS_AF", MU: "CS_AF", SC: "CS_AF", AO: "CS_AF",
  CD: "CS_AF", CG: "CS_AF", SD: "CS_AF",
};

const HAWAII_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO"]);

function getPtrZone(cc, airport) {
  if (cc === "US" && HAWAII_AIRPORTS.has(airport)) return "HI_CAM";
  return PTR_ZONE[cc] || null;
}

// Partner one-way chart (values from vault are round-trip, halved here)
// [economy, business, first]
const PTR = {};
function pp(a, b, e, biz, f) { PTR[pairKey(a, b)] = [e, biz, f]; }

// From TW
pp("TW", "HK_MAC",  20000, 27500, 37500);
pp("TW", "CHINA",   20000, 27500, 37500);
pp("TW", "N_ASIA",  20000, 30000, 37500);
pp("TW", "SE_ASIA", 20000, 35000, 62500);
pp("TW", "CS_ASIA", 30000, 47500, 70000);
pp("TW", "SW_PAC",  52500, 77500, 85000);
pp("TW", "N_AM",    57500, 87500, 105000);
pp("TW", "HI_CAM",  50000, 92500, 145000);
pp("TW", "S_AM",    67500, 108000, 145000);
pp("TW", "EU",      52500, 90000, 122500);
pp("TW", "M_EAST",  40500, 67500, 105000);
pp("TW", "N_AF",    45250, 80000, 125000);
pp("TW", "CS_AF",   50000, 92500, 145000);

// From HK/MAC
pp("HK_MAC", "CHINA",   17000, 27500, 37500);
pp("HK_MAC", "N_ASIA",  18500, 30000, 40000);
pp("HK_MAC", "SE_ASIA", 20000, 35000, 62500);
pp("HK_MAC", "CS_ASIA", 30000, 47500, 70000);
pp("HK_MAC", "SW_PAC",  52500, 77500, 85000);
pp("HK_MAC", "N_AM",    57500, 87500, 105000);
pp("HK_MAC", "HI_CAM",  50000, 92500, 145000);
pp("HK_MAC", "S_AM",    67500, 108000, 145000);
pp("HK_MAC", "EU",      52500, 90000, 122500);
pp("HK_MAC", "M_EAST",  40500, 67500, 105000);
pp("HK_MAC", "N_AF",    45250, 80000, 125000);
pp("HK_MAC", "CS_AF",   50000, 92500, 145000);

// From China
pp("CHINA", "N_ASIA",  15000, 27500, 37500);
pp("CHINA", "SE_ASIA", 18500, 27500, 37500);
pp("CHINA", "CS_ASIA", 25000, 40000, 62500);
pp("CHINA", "SW_PAC",  40000, 60000, 80000);
pp("CHINA", "N_AM",    52500, 77500, 95000);
pp("CHINA", "HI_CAM",  57500, 87500, 105000);
pp("CHINA", "S_AM",    50000, 92500, 145000);
pp("CHINA", "EU",      70000, 108000, 150000);
pp("CHINA", "M_EAST",  52500, 92500, 127500);
pp("CHINA", "N_AF",    40000, 67500, 105000);
pp("CHINA", "CS_AF",   45000, 80000, 125000);

// From N.Asia
pp("N_ASIA", "SE_ASIA", 15000, 27500, 37500);
pp("N_ASIA", "CS_ASIA", 25000, 40000, 62500);
pp("N_ASIA", "SW_PAC",  40000, 60000, 80000);
pp("N_ASIA", "N_AM",    52500, 77500, 95000);
pp("N_ASIA", "HI_CAM",  57500, 87500, 105000);
pp("N_ASIA", "S_AM",    50000, 92500, 145000);
pp("N_ASIA", "EU",      67500, 108000, 145000);
pp("N_ASIA", "M_EAST",  52500, 92500, 127500);
pp("N_ASIA", "N_AF",    46500, 69500, 105000);
pp("N_ASIA", "CS_AF",   48250, 81000, 125000);

// From SE Asia
pp("SE_ASIA", "CS_ASIA", 15000, 27500, 37500);
pp("SE_ASIA", "SW_PAC",  25000, 42500, 62500);
pp("SE_ASIA", "N_AM",    52500, 77500, 85000);
pp("SE_ASIA", "HI_CAM",  60000, 97500, 112500);
pp("SE_ASIA", "S_AM",    50000, 97500, 145000);
pp("SE_ASIA", "EU",      67500, 110000, 145000);
pp("SE_ASIA", "M_EAST",  52500, 80000, 107500);
pp("SE_ASIA", "N_AF",    37500, 52500, 85000);
pp("SE_ASIA", "CS_AF",   38750, 60000, 95000);

// From C/S Asia
pp("CS_ASIA", "SW_PAC",  15000, 22500, 30000);
pp("CS_ASIA", "N_AM",    51000, 77000, 102500);
pp("CS_ASIA", "HI_CAM",  60000, 97500, 145000);
pp("CS_ASIA", "S_AM",    52500, 100000, 145000);
pp("CS_ASIA", "EU",      60000, 105500, 145000);
pp("CS_ASIA", "M_EAST",  44500, 71000, 89000);
pp("CS_ASIA", "N_AF",    51000, 67000, 77000);
pp("CS_ASIA", "CS_AF",   51000, 67000, 83500);

// From SW Pacific
pp("SW_PAC", "N_AM",    17500, 27500, 37500);
pp("SW_PAC", "HI_CAM",  60000, 97500, 127500);
pp("SW_PAC", "S_AM",    55000, 97500, 127500);
pp("SW_PAC", "EU",      67500, 110500, 141000);
pp("SW_PAC", "M_EAST",  55000, 95000, 145000);
pp("SW_PAC", "N_AF",    50000, 92500, 145000);
pp("SW_PAC", "CS_AF",   50000, 92500, 145000);

// From N.Am
pp("N_AM", "HI_CAM",    19500, 29000, 38500);
pp("N_AM", "S_AM",      25000, 40000, 62500);
pp("N_AM", "EU",        34000, 52500, 85000);
pp("N_AM", "M_EAST",    34000, 65000, 85000);
pp("N_AM", "N_AF",      43000, 67500, 105000);
pp("N_AM", "CS_AF",     46500, 80000, 125000);

// From HI/C.Am
pp("HI_CAM", "S_AM",    30000, 52500, 85000);
pp("HI_CAM", "EU",      40000, 67500, 105000);
pp("HI_CAM", "M_EAST",  50000, 92500, 145000);
pp("HI_CAM", "N_AF",    50000, 92500, 145000);
pp("HI_CAM", "CS_AF",   50000, 92500, 145000);

// From S.Am
pp("S_AM", "EU",        15000, 27500, 37500);
pp("S_AM", "M_EAST",    47500, 78000, 105000);
pp("S_AM", "N_AF",      60000, 92500, 145000);
pp("S_AM", "CS_AF",     60000, 90000, 126250);

// From Europe
pp("EU", "M_EAST",      15000, 27500, 35000);
pp("EU", "N_AF",        35500, 53500, 64500);
pp("EU", "CS_AF",       35500, 53500, 74750);

// From Middle East
pp("M_EAST", "N_AF",    20000, 32500, 52500);
pp("M_EAST", "CS_AF",   27500, 38750, 57500);

// From N.Africa
pp("N_AF", "CS_AF",     20000, 32500, 52500);

// Within-zone pairs
pp("TW", "TW",          0, 0, 0);  // Domestic handled separately
pp("EU", "EU",          0, 0, 0);
pp("N_AM", "N_AM",      0, 0, 0);

export const slug = "infinity-mileagelands";

export const bookable = BOOKABLE;

export function handle(legs) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, BR_CARRIERS);
  const entries = [];

  // EVA own-metal
  if (chart !== "partner") {
    const oz = BR_ZONE[originCC] || null;
    const dz = BR_ZONE[destCC] || null;

    if (oz && dz) {
      const key = pairKey(oz, dz);
      const own = BR_OWN[key];
      if (own) {
        let [e, pe, b] = own;

        // Surcharge for ORD/JFK/IAH/YYZ (+5K OW per cabin)
        if ((oz === "AM" || dz === "AM") && oz !== dz) {
          const hasAmSurcharge = legs.some(
            (l) => AM_SURCHARGE_AIRPORTS.has(l.origin) || AM_SURCHARGE_AIRPORTS.has(l.destination)
          );
          if (hasAmSurcharge) {
            if (e !== null) e += 5000;
            if (pe !== null) pe += 5000;
            if (b !== null) b += 5000;
          }
        }

        const wrap = (v) => v === null ? null : [v, v];
        entries.push({
          programme: "eva", chart: "own", season: "default",
          economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: null,
        });
      }
    }
  }

  // Star Alliance partner chart
  if (chart !== "own") {
    const oz = getPtrZone(originCC, legs[0].origin);
    const dz = getPtrZone(destCC, legs[legs.length - 1].destination);

    if (oz && dz && oz !== dz) {
      const key = pairKey(oz, dz);
      const p = PTR[key];
      if (p) {
        const [e, b, f] = p;
        const wrap = (v) => v === null ? null : [v, v];
        entries.push({
          programme: "eva", chart: "partner", season: "default",
          economy: wrap(e), premium_economy: null, business: wrap(b), first: wrap(f),
        });
      }
    }
  }

  return entries;
}
