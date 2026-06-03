import { SQ_ECO_S, SQ_ECO_A, SQ_BIZ_S, SQ_BIZ_A, SQ_FIRST_S, SQ_FIRST_A, SQ_PE_S, PTR_ZONE, PTR_ECO, PTR_BIZ, PTR_FIRST } from "./charts.js";
/**
 * KrisFlyer Award Charts
 *
 * SQ metal: 13-zone matrix with Saver and Advantage tiers → returns [saver, advantage] ranges
 * Partner (Star Alliance): 12-zone matrix with single fixed rate → returns [rate, rate]
 *
 * All values stored in hundreds (e.g., 85 = 8,500 miles) to keep arrays compact.
 * Multiply by 100 before returning.
 */

const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","GA","HO","LH","LO","LX","MH","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","TR","UA","VA","ZH"]);

const SQ_CARRIERS = new Set(["SQ", "TR"]); // SQ metal + Scoot

// ── SQ Metal Zone mapping (13 zones) ──
// Z1=Singapore, Z2=SEA1, Z3=SEA2, Z4=NorthAsia1, Z5=NorthAsia2,
// Z6=CentralSouthAsia, Z7=Japan/SKorea, Z8=SWPac1, Z9=SWPac2,
// Z10=Africa/ME/Turkey, Z11=Europe, Z12=USWest, Z13=USEast
const SQ_ZONE = {
  SG: 1,
  MY: 2, ID: 2, BN: 2,
  PH: 3, TH: 3, VN: 3, MM: 3, KH: 3, LA: 3,
  HK: 4, TW: 4, MO: 4,
  CN: 5,
  IN: 6, LK: 6, MV: 6, BD: 6,
  JP: 7, KR: 7,
  // Z8/Z9 need airport-level resolution for Australia; default to Z9
  AU: 9, NZ: 9,
  // Z10: Africa/ME/Turkey
  ZA: 10, KE: 10, AE: 10, SA: 10, IL: 10, TR: 10, EG: 10,
  QA: 10, BH: 10, KW: 10, OM: 10, JO: 10,
  // Z11: Europe
  GB: 11, FR: 11, DE: 11, NL: 11, BE: 11, CH: 11, AT: 11,
  IE: 11, DK: 11, SE: 11, NO: 11, FI: 11, LU: 11, IS: 11,
  IT: 11, ES: 11, PT: 11, GR: 11, PL: 11, RO: 11, BG: 11,
  CZ: 11, HU: 11, HR: 11, RS: 11, SK: 11, SI: 11,
  // Z12/Z13 need airport-level for US; default Z13
  US: 13, CA: 12,
};

// Perth/Darwin/Western & Northern Australia = Z8
const SQ_Z8_AIRPORTS = new Set(["PER","DRW","BME","KTA","PHE","KNX","ASP","BNK"]);
// West coast US & Canada = Z12 (SQ flies LAX/SFO/SEA but zone covers all west coast)
const SQ_Z12_AIRPORTS = new Set([
  "LAX","SFO","SEA","SAN","PDX","SMF","SJC","OAK","ONT","SNA","BUR",
  "LGB","PSP","GEG","BOI","RNO","ANC","FAI","YVR","YYJ","YLW",
]);

function getSqZone(cc, airport) {
  if (cc === "AU" && SQ_Z8_AIRPORTS.has(airport)) return 8;
  if (cc === "US" && SQ_Z12_AIRPORTS.has(airport)) return 12;
  return SQ_ZONE[cc] || null;
}

// SQ Saver charts — [economy, premEcon, business, first] in hundreds
// null = not available for that zone pair. Indexed as CHART[from-1][to-1]
// Only storing key zone pairs relevant for India (Z6) and major routes.
// Full 13x13 matrices encoded row by row.


export const bookable = BOOKABLE;

export function handle(legs, _totalDistance) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const isSqMetal = carriers.length > 0 && carriers.every((c) => SQ_CARRIERS.has(c));
  const isPartner = carriers.length > 0 && carriers.every((c) => !SQ_CARRIERS.has(c));

  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const entries = [];

  // SQ Metal chart
  if (!isPartner) {
    const oz = getSqZone(originCC, legs[0].origin);
    const dz = getSqZone(destCC, legs[legs.length - 1].destination);
    if (oz && dz) {
      const i = oz - 1, j = dz - 1;
      const es = SQ_ECO_S[i]?.[j], ea = SQ_ECO_A[i]?.[j];
      const ps = SQ_PE_S[i]?.[j]; // PE only has Saver
      const bs = SQ_BIZ_S[i]?.[j], ba2 = SQ_BIZ_A[i]?.[j];
      const fs = SQ_FIRST_S[i]?.[j], fa = SQ_FIRST_A[i]?.[j];

      if (es !== null && es !== undefined) {
        const wrap = (s, a) => (s == null) ? null : [s * 100, (a || s) * 100];
        entries.push({
          programme: "krisflyer", chart: "own", season: "default",
          economy: wrap(es, ea),
          premium_economy: ps != null ? [ps * 100, ps * 100] : null,
          business: wrap(bs, ba2),
          first: wrap(fs, fa),
        });
      }
    }
  }

  // Partner chart
  if (!isSqMetal) {
    const oz = PTR_ZONE[originCC];
    const dz = PTR_ZONE[destCC];
    if (oz !== undefined && dz !== undefined) {
      const i = oz - 1, j = dz - 1;
      const e = PTR_ECO[i]?.[j];
      const b = PTR_BIZ[i]?.[j];
      const f = PTR_FIRST[i]?.[j];
      if (e !== undefined) {
        // Partner chart is round-trip; halve for one-way
        const half = (v) => v != null ? [v * 500, v * 500] : null;
        entries.push({
          programme: "krisflyer", chart: "partner", season: "default",
          economy: half(e), premium_economy: null, business: half(b), first: half(f),
        });
      }
    }
  }

  return entries;
}

