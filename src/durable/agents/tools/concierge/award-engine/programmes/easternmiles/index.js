/**
 * Eastern Miles (China Eastern Airlines) — Hybrid pricing
 *
 * Domestic: distance-based (km)
 * International: region-based from China
 * Non-alliance partners: separate charts (JAL, CX, QF)
 *
 * Note: Eastern Miles uses km for distance bands, not miles.
 * The haversine function returns statute miles, so we convert.
 *
 * Source: vault Award Charts/Eastern Miles.md
 * HOW TO REFRESH: Update zone maps and charts below
 */

import { resolveChart, pairKey } from "../../shared.js";

// SkyTeam members minus OK (Czech Airlines ceased operations)
// Plus non-alliance partners: JL, CX, QF
// JL added: present in ceair.com official redemption dropdown config
const BOOKABLE = new Set(["AF","AM","AR","CI","DL","GA","JL","KE","KL","KQ","ME","MF","MU","QF","RO","SK","SV","UX","VN","VS"]);

const MU_CARRIERS = new Set(["MU","FM"]); // MU = China Eastern, FM = Shanghai Airlines

// International zone mapping from China
const ZONE = {
  CN: "CN",
  HK: "HKMT", MO: "HKMT", TW: "HKMT",
  JP: "NEA", KR: "NEA",
  TH: "SEA", SG: "SEA", MY: "SEA", ID: "SEA", PH: "SEA",
  VN: "SEA", KH: "SEA", MM: "SEA", LA: "SEA",
  IN: "SACA", LK: "SACA", NP: "SACA", BD: "SACA", PK: "SACA",
  KZ: "SACA", UZ: "SACA",
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU",
  AT: "EU", IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU",
  IT: "EU", ES: "EU", PT: "EU", GR: "EU", PL: "EU", CZ: "EU",
  HU: "EU", RO: "EU", BG: "EU", HR: "EU", RS: "EU", SK: "EU",
  SI: "EU", RU: "EU", TR: "EU",
  US: "NAM", CA: "NAM",
  MX: "MXCAC", CU: "MXCAC", DO: "MXCAC", JM: "MXCAC",
  GT: "MXCAC", HN: "MXCAC", SV: "MXCAC", NI: "MXCAC",
  CR: "MXCAC", PA: "MXCAC",
  CO: "NSAM", EC: "NSAM", PE: "NSAM", VE: "NSAM", GY: "NSAM",
  BR: "SSAM", AR: "SSAM", CL: "SSAM", PY: "SSAM", UY: "SSAM",
  AU: "SPAC", NZ: "SPAC", FJ: "SPAC",
  AE: "MENA", QA: "MENA", SA: "MENA", EG: "MENA", MA: "MENA",
  KE: "CSAF", ZA: "CSAF", ET: "CSAF", NG: "CSAF",
};

const HI_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO"]);

function getZone(cc, airport) {
  if (cc === "US" && HI_AIRPORTS.has(airport)) return "HI";
  return ZONE[cc] || null;
}

// Domestic distance bands (km) and pricing
// [economy, business, first]
const DOM_BANDS_KM = [600, 1200, 1800, 2400, Infinity];
const DOM_CHART = [
  [6000, 8000, 11000],
  [10000, 13000, 18000],
  [13000, 16000, 22000],
  [16000, 20000, 28000],
  [25000, 32000, 43000],
];

// International chart from China (one-way)
// [economy, business, first]
const INTL = {
  HKMT: [20000, 26000, 40000],
  NEA:  [25000, 33000, 45000],
  SEA:  [30000, 39000, 54000],
  EU:   [46000, null, null],    // Only economy published
  SPAC: [46000, null, null],    // South Pacific / Hawaii grouped
  HI:   [46000, null, null],
};

// Non-alliance partner charts (round-trip)
// [economy_rt, business_rt, first_rt]
const PARTNER_JAL_NAM_JP  = [100000, 150000, 200000];
const PARTNER_CX_HK_SPAC  = [70000, 130000, null];
const PARTNER_QF_NAM_AU   = [200000, 340000, 420000];

export const slug = "eastern-miles";

export const bookable = BOOKABLE;

export function handle(legs, totalDistance) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, MU_CARRIERS);
  const entries = [];
  const carriers = legs.map((l) => l.carrier).filter(Boolean);

  // Domestic China
  if (chart !== "partner" && originCC === "CN" && destCC === "CN") {
    // Convert miles to km (1 mile = 1.60934 km)
    const distKm = Math.round(totalDistance * 1.60934);
    let idx = 0;
    for (let i = 0; i < DOM_BANDS_KM.length; i++) {
      if (distKm <= DOM_BANDS_KM[i]) { idx = i; break; }
    }
    const [e, b, f] = DOM_CHART[idx];
    entries.push({
      programme: "easternmiles", chart: "domestic", season: "default",
      economy: [e, e], premium_economy: null, business: [b, b], first: [f, f],
    });
    return entries;
  }

  // China Eastern international (from/to China)
  if (chart !== "partner") {
    const isCNOrigin = originCC === "CN";
    const isCNDest = destCC === "CN";

    if (isCNOrigin || isCNDest) {
      const foreignCC = isCNOrigin ? destCC : originCC;
      const foreignApt = isCNOrigin ? legs[legs.length - 1].destination : legs[0].origin;
      const zone = getZone(foreignCC, foreignApt);

      if (zone && INTL[zone]) {
        const [e, b, f] = INTL[zone];
        const wrap = (v) => v === null ? null : [v, v];
        entries.push({
          programme: "easternmiles", chart: "own_international", season: "default",
          economy: wrap(e), premium_economy: null, business: wrap(b), first: wrap(f),
        });
      }
    }
  }

  // Non-alliance partner charts (JAL, CX, QF)
  if (chart !== "own") {
    const oz = getZone(originCC, legs[0].origin);
    const dz = getZone(destCC, legs[legs.length - 1].destination);

    // JAL: North America — Japan (round-trip, halve for one-way)
    if ((oz === "NAM" && dz === "NEA") || (oz === "NEA" && dz === "NAM")) {
      const hasJL = carriers.length === 0 || carriers.some((c) => c === "JL");
      if (hasJL) {
        const [e, b, f] = PARTNER_JAL_NAM_JP;
        entries.push({
          programme: "easternmiles", chart: "partner_jal", season: "default",
          economy: [e / 2, e / 2], premium_economy: null,
          business: [b / 2, b / 2], first: [f / 2, f / 2],
        });
      }
    }

    // Cathay Pacific: Hong Kong — South Pacific (round-trip)
    if ((oz === "HKMT" && dz === "SPAC") || (oz === "SPAC" && dz === "HKMT")) {
      const hasCX = carriers.length === 0 || carriers.some((c) => c === "CX");
      if (hasCX) {
        const [e, b] = PARTNER_CX_HK_SPAC;
        entries.push({
          programme: "easternmiles", chart: "partner_cx", season: "default",
          economy: [e / 2, e / 2], premium_economy: null,
          business: [b / 2, b / 2], first: null,
        });
      }
    }

    // Qantas: North America — Australia (round-trip)
    if ((oz === "NAM" && dz === "SPAC") || (oz === "SPAC" && dz === "NAM")) {
      const hasQF = carriers.length === 0 || carriers.some((c) => c === "QF");
      if (hasQF) {
        const [e, b, f] = PARTNER_QF_NAM_AU;
        entries.push({
          programme: "easternmiles", chart: "partner_qf", season: "default",
          economy: [e / 2, e / 2], premium_economy: null,
          business: [b / 2, b / 2], first: [f / 2, f / 2],
        });
      }
    }
  }

  return entries;
}
