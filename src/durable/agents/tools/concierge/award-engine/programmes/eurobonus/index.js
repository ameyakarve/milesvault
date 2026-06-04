/**
 * EuroBonus (SAS/SkyTeam) — Zone-based charts
 *
 * SK own-metal: zone-based from Scandinavia, one-way (60% of RT)
 * SkyTeam partner: zone-based, round-trip chart. One-way = 60% of RT.
 *
 * Source: vault Award Charts/EuroBonus.md
 * HOW TO REFRESH: Update zone maps and charts below
 */

import { makeEntry, resolveChart, pairKey } from "../../shared.js";

const BOOKABLE = new Set(["AF","AM","AR","CI","DL","GA","KE","KL","KQ","ME","MF","MU","RO","SK","SV","UX","VN","VS"]);

const SK_CARRIERS = new Set(["SK"]);

// SAS own-metal zone mapping
const SK_ZONE = {
  DK: "DOM_SCAN", NO: "DOM_SCAN", SE: "DOM_SCAN",
  FI: "NORDIC", EE: "NORDIC", LV: "NORDIC", LT: "NORDIC", DE: "NORDIC", PL: "NORDIC",
  // All other European countries
  GB: "EUROPE", FR: "EUROPE", ES: "EUROPE", PT: "EUROPE", IT: "EUROPE", GR: "EUROPE",
  NL: "EUROPE", BE: "EUROPE", CH: "EUROPE", AT: "EUROPE", IE: "EUROPE", IS: "EUROPE",
  CZ: "EUROPE", HU: "EUROPE", RO: "EUROPE", BG: "EUROPE", HR: "EUROPE", RS: "EUROPE",
  SK: "EUROPE", SI: "EUROPE", TR: "EUROPE", CY: "EUROPE", MT: "EUROPE", LU: "EUROPE",
  AL: "EUROPE", BA: "EUROPE", ME: "EUROPE", MK: "EUROPE", UA: "EUROPE", BY: "EUROPE",
  GE: "EUROPE", AM: "EUROPE", AZ: "EUROPE", RU: "EUROPE", MD: "EUROPE",
  // Intercontinental
  US: "INTERCON", CA: "INTERCON", MX: "INTERCON",
  JP: "INTERCON", CN: "INTERCON", KR: "INTERCON", TH: "INTERCON",
  IN: "INTERCON", HK: "INTERCON", SG: "INTERCON",
};

// SAS own-metal chart: [economy, premEcon, business] — one-way pricing
const SK_CHART = {
  DOM_SCAN: [5000, 10000, null],
  NORDIC:   [10000, 15000, 20000],
  EUROPE:   [15000, 20000, 35000],
  INTERCON: [30000, 45000, 60000],
};

// Partner zone mapping
const PTR_ZONE = {
  // Domestic Europe (DK, NO, SE, FR metropolitan, ES, IT)
  // Note: these countries can be both "Domestic Europe" and "Europe" zone.
  // Partner chart uses the broader zone system — Domestic Europe applies
  // for intra-country flights in these specific countries.

  // Europe
  DK: "EU", NO: "EU", SE: "EU", FI: "EU",
  AL: "EU", AM: "EU", AT: "EU", BY: "EU", BE: "EU", BA: "EU", BG: "EU",
  HR: "EU", CY: "EU", CZ: "EU", EE: "EU", FR: "EU", GE: "EU", DE: "EU",
  GR: "EU", GL: "EU", HU: "EU", IS: "EU", IE: "EU", IT: "EU", LV: "EU",
  LT: "EU", LU: "EU", MK: "EU", MT: "EU", MD: "EU", ME: "EU", NL: "EU",
  PL: "EU", PT: "EU", RO: "EU", RS: "EU", SK: "EU", SI: "EU", ES: "EU",
  CH: "EU", TR: "EU", UA: "EU", GB: "EU",

  // North America (excl. Hawaii)
  US: "NAM", CA: "NAM", MX: "NAM",

  // Central America & Caribbean
  AG: "CAC", AW: "CAC", BS: "CAC", BB: "CAC", BZ: "CAC", BM: "CAC",
  KY: "CAC", CR: "CAC", CU: "CAC", CW: "CAC", DM: "CAC", DO: "CAC",
  SV: "CAC", GD: "CAC", GP: "CAC", GT: "CAC", HT: "CAC", HN: "CAC",
  JM: "CAC", MQ: "CAC", NI: "CAC", PA: "CAC", PR: "CAC", KN: "CAC",
  LC: "CAC", SX: "CAC", VC: "CAC", TT: "CAC", VI: "CAC",

  // South America
  AR: "SAM", BO: "SAM", BR: "SAM", CL: "SAM", CO: "SAM", EC: "SAM",
  GF: "SAM", GY: "SAM", PY: "SAM", PE: "SAM", SR: "SAM", UY: "SAM",
  VE: "SAM",

  // N./Central Africa & Middle East
  DZ: "NCAME", AZ: "NCAME", BH: "NCAME", BJ: "NCAME", BF: "NCAME",
  CM: "NCAME", TD: "NCAME", CI: "NCAME", DJ: "NCAME", EG: "NCAME",
  GQ: "NCAME", ET: "NCAME", GA: "NCAME", GM: "NCAME", GH: "NCAME",
  GN: "NCAME", IR: "NCAME", IQ: "NCAME", IL: "NCAME", JO: "NCAME",
  KE: "NCAME", KW: "NCAME", LB: "NCAME", LR: "NCAME", LY: "NCAME",
  ML: "NCAME", MR: "NCAME", MA: "NCAME", NE: "NCAME", NG: "NCAME",
  OM: "NCAME", QA: "NCAME", SA: "NCAME", SN: "NCAME", SO: "NCAME",
  SD: "NCAME", SY: "NCAME", TZ: "NCAME", TG: "NCAME", TN: "NCAME",
  UG: "NCAME", AE: "NCAME", YE: "NCAME",

  // Southern Africa
  AO: "SAF", BW: "SAF", LS: "SAF", MG: "SAF", MW: "SAF", MU: "SAF",
  MZ: "SAF", NA: "SAF", ZA: "SAF", ZM: "SAF", ZW: "SAF",

  // Central, East & South Asia
  AF: "CESA", BD: "CESA", CN: "CESA", HK: "CESA", MO: "CESA",
  IN: "CESA", JP: "CESA", KZ: "CESA", KG: "CESA", MV: "CESA",
  MN: "CESA", NP: "CESA", PK: "CESA", RU: "CESA", KR: "CESA",
  LK: "CESA", TW: "CESA", TJ: "CESA", TM: "CESA", UZ: "CESA",

  // Southeast Asia
  BN: "SEA", KH: "SEA", GU: "SEA", ID: "SEA", LA: "SEA", MY: "SEA",
  MM: "SEA", PG: "SEA", PH: "SEA", SG: "SEA", TH: "SEA", VN: "SEA",

  // Pacific (incl. Hawaii)
  AU: "PAC", NZ: "PAC", FJ: "PAC", PF: "PAC", NC: "PAC",
  WS: "PAC", TO: "PAC", CK: "PAC", MH: "PAC",
};

const HAWAII_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO"]);

function getPtrZone(cc, airport) {
  // Hawaii is Pacific, not North America
  if (cc === "US" && HAWAII_AIRPORTS.has(airport)) return "PAC";
  return PTR_ZONE[cc] || null;
}

// Partner chart: round-trip values. One-way = 60% of RT.
// Stored as [economy, premEcon, business, first] round-trip.
// For domestic Europe intra-zone: separate rate.
const PTR = {};
function tp(a, b, e, pe, biz, f) {
  PTR[pairKey(a, b)] = [e, pe, biz, f];
}

// Domestic Europe (intra-zone — same origin-dest zone within DOM_EU countries)
// This is handled as EU-EU with lower rate for specific countries
const PTR_DOM_EU = [20000, null, 40000, null]; // RT

// From Europe
tp("EU", "EU",     40000, null, 80000, null);
tp("EU", "NAM",    70000, 105000, 140000, 175000);
tp("EU", "CAC",    80000, 120000, 180000, 200000);
tp("EU", "SAM",    90000, 135000, 190000, 225000);
tp("EU", "NCAME",  60000, 90000, 130000, 140000);
tp("EU", "SAF",    90000, 135000, 180000, 225000);
tp("EU", "CESA",   90000, 135000, 180000, 225000);
tp("EU", "SEA",    95000, 142500, 190000, 257500);
tp("EU", "PAC",    140000, 210000, 280000, 380000);

// From North America
tp("NAM", "NAM",   25000, 37500, 50000, 70000);
tp("NAM", "CAC",   37500, 56250, 70000, 95000);
tp("NAM", "SAM",   50000, 75000, 90000, 120000);
tp("NAM", "NCAME", 80000, 120000, 140000, 190000);
tp("NAM", "SAF",   100000, 150000, 175000, 235000);
tp("NAM", "CESA",  90000, 135000, 165000, 225000);
tp("NAM", "SEA",   90000, 135000, 165000, 225000);
tp("NAM", "PAC",   90000, 135000, 165000, 225000);

// From Central America & Caribbean
tp("CAC", "CAC",   25000, 37500, 50000, 70000);
tp("CAC", "SAM",   37500, 56250, 70000, 95000);
tp("CAC", "NCAME", 90000, 135000, 157500, 212500);
tp("CAC", "SAF",   85000, 127500, 152500, 205000);
tp("CAC", "CESA",  100000, 150000, 177500, 237500);
tp("CAC", "SEA",   100000, 150000, 177500, 237500);
tp("CAC", "PAC",   100000, 150000, 177500, 237500);

// From South America
tp("SAM", "SAM",   37500, 56250, 50000, 70000);
tp("SAM", "NCAME", 100000, 150000, 175000, 235000);
tp("SAM", "SAF",   70000, 105000, 130000, 175000);
tp("SAM", "CESA",  110000, 165000, 190000, 250000);
tp("SAM", "SEA",   110000, 165000, 190000, 250000);
tp("SAM", "PAC",   110000, 165000, 190000, 250000);

// From N./Central Africa & Middle East
tp("NCAME", "NCAME", 25000, 37500, 50000, 70000);
tp("NCAME", "SAF",   60000, 90000, 105000, 140000);
tp("NCAME", "CESA",  80000, 120000, 140000, 190000);
tp("NCAME", "SEA",   70000, 105000, 130000, 130000);
tp("NCAME", "PAC",   100000, 150000, 175000, 235000);

// From Southern Africa
tp("SAF", "SAF",   25000, 37500, 50000, 70000);
tp("SAF", "CESA",  120000, 180000, 215000, 285000);
tp("SAF", "SEA",   90000, 135000, 165000, 225000);
tp("SAF", "PAC",   100000, 150000, 175000, 235000);

// From Central, East & South Asia
tp("CESA", "CESA", 25000, 37500, 50000, 70000);
tp("CESA", "SEA",  50000, 75000, 90000, 120000);
tp("CESA", "PAC",  70000, 105000, 130000, 175000);

// From Southeast Asia
tp("SEA", "SEA",   25000, 37500, 50000, 70000);
tp("SEA", "PAC",   70000, 105000, 130000, 175000);

// From Pacific
tp("PAC", "PAC",   25000, 37500, 50000, 70000);

// Domestic Europe countries
const DOM_EU_COUNTRIES = new Set(["DK", "NO", "SE", "FR", "ES", "IT"]);

export const slug = "eurobonus";

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, SK_CARRIERS);
  const entries = [];

  // SAS own-metal
  if (chart !== "partner") {
    // SAS own-metal: origin or dest should be in Scandinavia
    const isScanOrigin = ["DK", "NO", "SE"].includes(originCC);
    const isScanDest = ["DK", "NO", "SE"].includes(destCC);

    if (isScanOrigin || isScanDest) {
      // Determine zone of the non-Scandinavian end
      let zone;
      if (isScanOrigin && isScanDest) {
        // Domestic or Nordic
        const foreignCC = destCC;
        zone = SK_ZONE[foreignCC] || null;
        // If both are in DK/NO/SE, it's domestic
        if (originCC === destCC) zone = "DOM_SCAN";
      } else {
        const foreignCC = isScanOrigin ? destCC : originCC;
        zone = SK_ZONE[foreignCC] || null;
      }

      if (zone && SK_CHART[zone]) {
        const [e, pe, b] = SK_CHART[zone];
        const wrap = (v) => v === null ? null : [v, v];
        entries.push({
          programme: "eurobonus", chart: "sk_operated", season: "default",
          economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: null,
        });
      }
    }
  }

  // SkyTeam partner chart
  if (chart !== "own") {
    const oz = getPtrZone(originCC, legs[0].origin);
    const dz = getPtrZone(destCC, legs[legs.length - 1].destination);

    if (oz && dz) {
      let rt;

      // Check for Domestic Europe
      if (oz === "EU" && dz === "EU" &&
          DOM_EU_COUNTRIES.has(originCC) && DOM_EU_COUNTRIES.has(destCC) &&
          originCC === destCC) {
        rt = PTR_DOM_EU;
      } else {
        rt = PTR[pairKey(oz, dz)];
      }

      if (rt) {
        const [e, pe, biz, f] = rt;
        // One-way = 60% of round-trip
        const ow = (v) => v === null ? null : [Math.round(v * 0.6), Math.round(v * 0.6)];
        entries.push({
          programme: "eurobonus", chart: "partner", season: "default",
          economy: ow(e), premium_economy: ow(pe), business: ow(biz), first: ow(f),
        });
      }
    }
  }

  return entries;
}
