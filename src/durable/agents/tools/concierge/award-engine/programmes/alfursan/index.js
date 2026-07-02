/**
 * Alfursan (Saudia) — Zone-based charts
 *
 * SV own-metal: zone-based from Saudi Arabia, Reward and Reward+ tiers.
 *   Reward+ = exactly 2x Reward. First only at Reward rates.
 *   Returns [Reward, Reward+] for economy/business, [Reward, Reward] for first.
 *
 * SkyTeam partner: 17-zone matrix (round-trip, halved for one-way).
 *   Only sample partner pricing available — limited zone pairs.
 *
 * Source: vault Award Charts/Alfursan.md
 * HOW TO REFRESH: Update zone maps and charts below
 */

import { resolveChart, pairKey } from "../../shared.js";

// SkyTeam members minus OK (Czech Airlines ceased operations)
const BOOKABLE = new Set(["AF","AM","AR","AZ","CI","CZ","DL","EY","GA","KE","KL","KQ","ME","MF","MU","RO","SK","SV","UX","VN","VS"]);

const SV_CARRIERS = new Set(["SV"]);

// Own-metal zone mapping
const OWN_ZONE = {
  SA: "DOM",
  AE: "GCC", BH: "GCC", QA: "GCC", KW: "GCC", OM: "GCC", YE: "GCC",
  JO: "ME", LB: "ME", SY: "ME", CY: "ME", EG: "ME", IQ: "ME", IR: "ME",
  DJ: "AFE", ET: "AFE", KE: "AFE", SD: "AFE",
  MA: "AFN", TN: "AFN", DZ: "AFN", LY: "AFN",
  ZA: "AFS", NA: "AFS", NG: "AFS", MU: "AFS",
  TR: "EUA",
  // Europe B: all Europe except Turkey
  GB: "EUB", FR: "EUB", DE: "EUB", NL: "EUB", BE: "EUB", CH: "EUB",
  AT: "EUB", IE: "EUB", DK: "EUB", SE: "EUB", NO: "EUB", FI: "EUB",
  IT: "EUB", ES: "EUB", PT: "EUB", GR: "EUB", PL: "EUB", CZ: "EUB",
  HU: "EUB", RO: "EUB", BG: "EUB", HR: "EUB", RS: "EUB", SK: "EUB",
  SI: "EUB", RU: "EUB", GE: "EUB", AZ: "EUB", KZ: "EUB", UZ: "EUB",
  // Subcontinent A: Pakistan, North India, Nepal
  PK: "SCA", NP: "SCA",
  // Subcontinent B: South India, Sri Lanka, Bangladesh, Maldives
  LK: "SCB", BD: "SCB", MV: "SCB",
  // Far East
  MY: "FE", SG: "FE", ID: "FE", TH: "FE", VN: "FE", KH: "FE",
  MM: "FE", TW: "FE", LA: "FE", HK: "FE", PH: "FE",
  // North America A: USA (excl Alaska, Hawaii, LA), Canada
  CA: "NAMA",
  // North America B: Los Angeles
};

// India: North India airports → SCA, South India → SCB
const NORTH_INDIA_AIRPORTS = new Set(["DEL","BOM","AMD","JAI","LKO","CCU","GAU","ATQ","SXR","VNS","IXC","PAT"]);

function getOwnZone(cc, airport) {
  if (cc === "IN") {
    return NORTH_INDIA_AIRPORTS.has(airport) ? "SCA" : "SCB";
  }
  if (cc === "US") {
    if (airport === "LAX") return "NAMB";
    return "NAMA";
  }
  return OWN_ZONE[cc] || null;
}

// Saudia own-metal chart — one-way from Saudi Arabia
// [ecoReward, bizReward, firstReward]
const SV_OWN = {
  DOM:  [4500, 15000, 22500],
  GCC:  [5000, 24000, 35000],
  ME:   [6500, 28000, 40000],
  AFE:  [12000, 36500, 52500],
  AFN:  [10000, 46000, 62500],
  AFS:  [9000, 47500, 70000],
  EUA:  [11500, 37000, 52500],
  EUB:  [12000, 44000, 62500],
  SCA:  [9000, 34000, 47500],
  SCB:  [12000, 37000, 52500],
  FE:   [18000, 64000, 90000],
  NAMA: [22000, 65000, 105000],
  NAMB: [25000, 80000, 120000],
};

// SkyTeam partner chart — 17-zone system
const PTR_ZONE = {
  SA: 1,
  AE: 2, BH: 2, QA: 2, KW: 2, OM: 2, YE: 2,
  JO: 3, LB: 3, SY: 3, CY: 3, EG: 3, IQ: 3, IR: 3,
  DJ: 4, ET: 4, KE: 4, SD: 4,
  MA: 5, TN: 5, DZ: 5, LY: 5,
  ZA: 6, NA: 6, NG: 6, MU: 6,
  TR: 7,
  GB: 8, FR: 8, DE: 8, NL: 8, BE: 8, CH: 8, AT: 8,
  IE: 8, DK: 8, SE: 8, NO: 8, FI: 8, IT: 8, ES: 8,
  PT: 8, GR: 8, PL: 8, CZ: 8, HU: 8, RO: 8, BG: 8,
  HR: 8, RS: 8, SK: 8, SI: 8, RU: 8, GE: 8, AZ: 8,
  KZ: 8, UZ: 8,
  PK: 9, NP: 9,
  LK: 10, BD: 10, MV: 10,
  MY: 11, SG: 11, ID: 11, TH: 11, VN: 11, KH: 11,
  MM: 11, TW: 11, LA: 11, HK: 11, PH: 11,
  JP: 12, KR: 12, CN: 12,
  CA: 13,
  // 14: Alaska, Los Angeles, Caribbean, PR, MX, Central America
  MX: 14, CU: 14, DO: 14, JM: 14, BS: 14, BB: 14, TT: 14,
  PR: 14, GT: 14, HN: 14, SV: 14, NI: 14, CR: 14, PA: 14,
  // South America
  BR: 15, AR: 15, CL: 15, CO: 15, PE: 15, VE: 15, EC: 15,
  BO: 15, PY: 15, UY: 15,
  // Australasia
  AU: 17, NZ: 17,
};

const HI_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO"]);
const AK_AIRPORTS = new Set(["ANC","FAI","JNU"]);

function getPtrZone(cc, airport) {
  if (cc === "IN") {
    return NORTH_INDIA_AIRPORTS.has(airport) ? 9 : 10;
  }
  if (cc === "US") {
    if (HI_AIRPORTS.has(airport)) return 16;
    if (AK_AIRPORTS.has(airport)) return 14;
    if (airport === "LAX") return 14;
    return 13;
  }
  return PTR_ZONE[cc] || null;
}

// Sample partner pricing (round-trip) from vault
// Key = pairKey(z1, z2), Value = [economy_rt, business_rt, first_rt]
const PTR = {};
function pt(a, b, e, biz, f) { PTR[pairKey(String(a), String(b))] = [e, biz, f]; }
pt(1, 1, 25000, 50000, 75000);    // Domestic SA
pt(1, 2, 25000, 50000, 75000);    // SA — GCC
pt(13, 8, 50000, 100000, 150000); // USA — Europe
pt(13, 15, 45000, 90000, 0);      // USA — South America
pt(16, 17, 40000, 80000, 0);      // Hawaii — Australasia

export const slug = "alfursan";

export const bookable = BOOKABLE;

export function handle(legs) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, SV_CARRIERS);
  const entries = [];

  // Saudia own-metal — from/to Saudi Arabia
  if (chart !== "partner") {
    const isSAOrigin = originCC === "SA";
    const isSADest = destCC === "SA";

    if (isSAOrigin || isSADest) {
      const foreignCC = isSAOrigin ? destCC : originCC;
      const foreignApt = isSAOrigin ? legs[legs.length - 1].destination : legs[0].origin;
      const zone = getOwnZone(foreignCC, foreignApt);

      if (zone && SV_OWN[zone]) {
        const [e, b, f] = SV_OWN[zone];
        // Reward: [e, e], Reward+: [2*e, 2*e]. Return [Reward, Reward+].
        entries.push({
          programme: "alfursan", chart: "own_reward", season: "Reward",
          economy: [e, e], premium_economy: null,
          business: [b, b], first: [f, f],
        });
        entries.push({
          programme: "alfursan", chart: "own_reward_plus", season: "Reward+",
          economy: [e * 2, e * 2], premium_economy: null,
          business: [b * 2, b * 2], first: null,  // No First on Reward+
        });
      }
    } else if (originCC === destCC && originCC === "SA") {
      // Domestic
      const [e, b, f] = SV_OWN["DOM"];
      entries.push({
        programme: "alfursan", chart: "own_reward", season: "Reward",
        economy: [e, e], premium_economy: null,
        business: [b, b], first: [f, f],
      });
      entries.push({
        programme: "alfursan", chart: "own_reward_plus", season: "Reward+",
        economy: [e * 2, e * 2], premium_economy: null,
        business: [b * 2, b * 2], first: null,
      });
    }
  }

  // SkyTeam partner chart
  if (chart !== "own") {
    const oz = getPtrZone(originCC, legs[0].origin);
    const dz = getPtrZone(destCC, legs[legs.length - 1].destination);

    if (oz !== null && dz !== null) {
      const key = pairKey(String(oz), String(dz));
      const rt = PTR[key];

      if (rt) {
        const [e, biz, f] = rt;
        // One-way = half round-trip
        const ow = (v) => v === 0 ? null : [v / 2, v / 2];
        entries.push({
          programme: "alfursan", chart: "partner", season: "default",
          economy: ow(e), premium_economy: null, business: ow(biz), first: ow(f),
        });
      }
    }
  }

  return entries;
}
