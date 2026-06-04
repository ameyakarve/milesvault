/**
 * SKYPASS (Korean Air)
 *
 * - KE own-metal: zone-based with peak (1.5x) and off-peak. Returns [offpeak, peak].
 * - SkyTeam partner: zone-based, round-trip only (halved for one-way). No peak/off-peak.
 *
 * Source: koreanair.com + vault Award Charts/SKYPASS.md
 * HOW TO REFRESH: Update zone maps and charts below
 */

import { pairKey } from "../../shared.js";

const BOOKABLE = new Set(["AF","AM","AR","AS","CI","CZ","DL","EK","G3","GA","JL","KE","KL","KQ","ME","MF","MU","RO","SK","SV","UX","VN","VS"]);

const KE_CARRIERS = new Set(["KE"]);

// Zone assignments
const ZONE = {
  KR: "KR",
  JP: "JP",
  CN: "CN", MO: "CN",
  HK: "NEA", TW: "NEA", MN: "NEA",
  TH: "SEA", SG: "SEA", MY: "SEA", ID: "SEA", PH: "SEA", VN: "SEA",
  KH: "SEA", MM: "SEA", LA: "SEA", GU: "SEA",
  IN: "SWA", LK: "SWA", MV: "SWA", NP: "SWA", BD: "SWA", PK: "SWA", UZ: "SWA",
  US: "NAM", CA: "NAM", MX: "NAM", PR: "NAM",
  GT: "CAM", HN: "CAM", SV: "CAM", NI: "CAM", CR: "CAM", PA: "CAM",
  CU: "CAM", DO: "CAM", JM: "CAM", BS: "CAM", BB: "CAM", TT: "CAM",
  BR: "SAM", AR: "SAM", CL: "SAM", CO: "SAM", PE: "SAM",
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU", AT: "EU",
  IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU", IT: "EU", ES: "EU",
  PT: "EU", GR: "EU", PL: "EU", CZ: "EU", HU: "EU", RO: "EU", TR: "EU",
  RU: "EU", HR: "EU", RS: "EU", BG: "EU", SK: "EU", SI: "EU",
  AE: "ME", SA: "ME", QA: "ME", BH: "ME", KW: "ME", OM: "ME", IL: "ME", JO: "ME",
  ZA: "AF", KE: "AF", TZ: "AF", ET: "AF", NG: "AF", EG: "AF", MA: "AF",
  AU: "OC", NZ: "OC", FJ: "OC",
};

// KE own-metal: [econ_offpeak, prestige_offpeak, first_offpeak]
// Peak = 1.5x offpeak. Returns [offpeak, peak] ranges.
// Key = pairKey(originZone, destZone)
const KE_OWN = {
  [pairKey("KR","KR")]: [5000, 6000, 0],
  [pairKey("KR","JP")]: [15000, 22500, 32500],
  [pairKey("KR","CN")]: [15000, 22500, 32500],
  [pairKey("KR","NEA")]: [15000, 22500, 32500],
  [pairKey("KR","SEA")]: [20000, 35000, 45000],
  [pairKey("KR","SWA")]: [25000, 45000, 57500],
  [pairKey("KR","NAM")]: [35000, 62500, 80000],
  [pairKey("KR","EU")]: [35000, 62500, 80000],
  [pairKey("KR","ME")]: [35000, 62500, 80000],
  [pairKey("KR","OC")]: [35000, 62500, 80000],
  // From NAM
  [pairKey("NAM","JP")]: [35000, 62500, 80000],
  [pairKey("NAM","CN")]: [35000, 62500, 80000],
  [pairKey("NAM","NEA")]: [35000, 62500, 80000],
  [pairKey("NAM","SEA")]: [42500, 75000, 95000],
  [pairKey("NAM","SWA")]: [47500, 85000, 105000],
  [pairKey("NAM","OC")]: [55000, 97500, 120000],
};

// SkyTeam partner chart: round-trip. Key = pairKey(originZone, destZone)
// [economy_rt, business_rt, first_rt]
const PTR = {
  // From NAM
  [pairKey("NAM","NAM")]: [25000, 45000, 45000],
  [pairKey("NAM","CAM")]: [35000, 75000, 75000],
  [pairKey("NAM","EU")]: [50000, 80000, 100000],
  [pairKey("NAM","SAM")]: [50000, 110000, 110000],
  [pairKey("NAM","ME")]: [80000, 120000, 160000],
  [pairKey("NAM","AF")]: [80000, 120000, 160000],
  [pairKey("KR","NAM")]: [80000, 140000, 180000],  // KR/JP to NAM
  [pairKey("JP","NAM")]: [80000, 140000, 180000],
  [pairKey("NAM","SEA")]: [90000, 155000, 200000],
  [pairKey("NAM","NEA")]: [90000, 155000, 200000],
  [pairKey("NAM","SWA")]: [100000, 170000, 230000],
  [pairKey("NAM","OC")]: [110000, 185000, 260000],
  // Intra-region
  [pairKey("CN","CN")]: [20000, 25000, 0],
  [pairKey("ID","ID")]: [20000, 25000, 0],
  [pairKey("SAM","SAM")]: [25000, 40000, 0],
  [pairKey("ME","ME")]: [25000, 40000, 0],
  [pairKey("EU","EU")]: [25000, 0, 0],
};

export const slug = "skypass";

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const oz = ZONE[originCC];
  const dz = ZONE[destCC];
  if (!oz || !dz) return [];

  const key = pairKey(oz, dz);
  const entries = [];

  // KE own-metal — [offpeak, peak]
  if (carriers.length === 0 || carriers.every((c) => KE_CARRIERS.has(c))) {
    const own = KE_OWN[key];
    if (own) {
      const [e, b, f] = own;
      const wrap = (v) => v === 0 ? null : [v, Math.round(v * 1.5)];
      if (carriers.every((c) => KE_CARRIERS.has(c))) {
        entries.push({
          programme: "skypass", chart: "own", season: "default",
          economy: wrap(e), premium_economy: null, business: wrap(b), first: wrap(f),
        });
        return entries;
      }
    }
  }

  // Partner chart — round-trip halved for one-way
  const ptr = PTR[key];
  if (ptr) {
    const [e, b, f] = ptr;
    const wrap = (v) => v === 0 ? null : [v / 2, v / 2];
    entries.push({
      programme: "skypass", chart: "partner", season: "default",
      economy: wrap(e), premium_economy: null, business: wrap(b), first: wrap(f),
    });
  }

  return entries;
}
