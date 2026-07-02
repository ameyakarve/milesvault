/**
 * Virgin Atlantic Flying Club
 *
 * Multiple per-partner charts:
 * - VS own-metal: dynamic with [min_floor, peak_saver_cap] ranges
 * - Delta: region-based (US-UK) + distance-based (all other)
 * - ANA: zone-based from Japan, also from US
 * - AF/KLM: short-haul distance-based + long-haul zone-based
 * - SkyTeam general: distance-based
 * - Air NZ: zone-based (return [0,0] — route-specific)
 * - LATAM: short-haul distance + long-haul zone
 * - Other non-chart partners (SA, WS, 6E, LY, VA, EL AL): return [0,0]
 */

import { haversine, makeEntry, resolveBand } from "../../shared.js";

const BOOKABLE = new Set(["6E","AF","AM","AR","CI","DL","GA","KE","KL","KQ","LA","LY","ME","MF","MU","NH","NZ","RO","SA","SK","SV","UX","VA","VN","VS","WS"]);

const VS_CARRIERS = new Set(["VS"]);
const DL_CARRIERS = new Set(["DL"]);
const ANA_CARRIERS = new Set(["NH"]);
const AFKL_CARRIERS = new Set(["AF", "KL"]);
const NZ_CARRIERS = new Set(["NZ"]);
const LA_CARRIERS = new Set(["LA"]);

// SkyTeam general chart partners (OK/Czech Airlines removed — ceased operations 2024)
const SKYTEAM_PARTNERS = new Set(["AM","AR","UX","GA","KQ","KE","ME","SK","VN","MF","CI"]);

// Partners without a published chart — return [0,0]
const NO_CHART_PARTNERS = new Set(["6E","LY","SA","VA","WS","MU","RO"]);

// ── VS own-metal dynamic pricing (one-way from/to UK) ──
// [econ_peak_cap, prem_peak_cap, upper_peak_cap]
const VS_PEAK_CAPS = {
  IN: [20000, 27500, 47500],
  AE: [20000, 27500, 47500], SA: [20000, 27500, 47500],
  QA: [20000, 27500, 47500], BH: [20000, 27500, 47500],
  OM: [20000, 27500, 47500], JO: [20000, 27500, 47500],
  JM: [20000, 27500, 67500], BB: [20000, 27500, 67500],
  AG: [20000, 27500, 67500], TT: [20000, 27500, 67500],
  BS: [20000, 27500, 67500], LC: [20000, 27500, 67500],
  GD: [20000, 27500, 67500],
  ZA: [22500, 42500, 67500], KE: [22500, 42500, 67500],
  NG: [22500, 42500, 67500], MV: [22500, 42500, 67500],
  MU: [22500, 42500, 67500],
  US: [25000, 37500, 77500],
  IL: [11000, 20000, 33000],
};
// VS US East Coast & Orlando: NYC area, New England, Mid-Atlantic, Southeast, Florida
const VS_US_EAST = new Set([
  "JFK","EWR","LGA","BOS","PHL","DCA","IAD","BWI","CLT","RDU","ATL",
  "MCO","MIA","FLL","TPA","PBI","JAX","RSW","MSY","BNA","RIC","ORF",
  "PIT","CHS","SAV","IND","CVG","CMH","MKE","BUF","SYR","PVD","BDL",
]);
const VS_US_EAST_CAP = [20000, 27500, 57500];
// VS US Central/Midwest/Mountain: Interior US
const VS_US_MID = new Set([
  "ORD","MDW","DFW","IAH","HOU","MSP","DTW","DEN","STL","MCI","OMA",
  "SLC","PHX","ABQ","AUS","SAT","MSY","MEM","SDF","CLE","TUL","OKC",
  "LAS","ELP","BOI","BIL","FAR","GRR","DSM","ICT","LIT","XNA",
]);
const VS_US_MID_CAP = [22500, 32500, 57500];

// Universal minimum floors [econ, prem, upper] (from VS website + Seats.aero live data, Mar 2026)
// These are the absolute lowest possible regardless of direction
const VS_MIN = [6000, 10500, 23000];

function getVsCaps(cc, airport) {
  if (cc === "US") {
    if (VS_US_EAST.has(airport)) return VS_US_EAST_CAP;
    if (VS_US_MID.has(airport)) return VS_US_MID_CAP;
    return VS_PEAK_CAPS["US"];
  }
  return VS_PEAK_CAPS[cc] || null;
}

// ── Delta distance-based (all non-UK/Europe routes) ──
const DL_BANDS = [500, 1000, 1500, 2250, 3000, 4000, 5000, 6000, Infinity];
const DL_DIST = [
  [7500, 21000], [11000, 41500], [16500, 59500], [18500, 65500],
  [22000, 70000], [35000, 80000], [44000, 105000], [49500, 130000], [65500, 165000],
];

// ── SkyTeam general distance-based ──
const ST_BANDS = [500, 1000, 1500, 2250, 3000, 4000, 5000, 6000, 7000, Infinity];
const ST_CHART = [
  [5500, 14500], [7000, 15500], [10000, 21500], [11500, 35000],
  [15500, 40000], [20500, 60000], [25500, 75000], [31000, 85000],
  [37000, 100000], [50000, 140000],
];

// ── AF/KL short-haul distance-based ──
const AFKL_SH_BANDS = [600, 1249, 1749];
const AFKL_SH_CHART = [
  [4000, 4500, 8000, 9000],
  [7500, 8500, 25000, 26000],
  [9000, 11000, 30000, 32000],
];

// ── AF/KL long-haul zone-based (key route pairs, one-way) ──
// [econ_offpeak, econ_peak, biz_offpeak, biz_peak]
const AFKL_LH = {
  // Zone 5 (India/South Africa/Indian Ocean) → Zone 1 (W/C Europe)
  "AT-EU": [15000, 25000, 56000, 66000],
  // Zone 1 → Zone 6 (E Coast NA) / Zone 7 (W Coast NA)
  "EU-NAM": [22000, 32000, 48500, 58500],
  // Zone 1 → Zone 9 (Far East)
  "EU-PA": [25000, 35000, 0, 0],
  // Zone 5 → Zone 9
  "AT-PA": [14500, 24500, 0, 0],
};

// ── LATAM short-haul distance-based ──
const LA_SH_BANDS = [250, 400, 550, 1250, 4000];
const LA_SH_CHART = [
  [7500, 15000, 20000], [12500, 22500, 30000], [17500, 25000, 35000],
  [22500, 32500, 45000], [25000, 35000, 50000],
];

// ── LATAM long-haul zone-based (one-way) ──
// [economy, premEcon, business]
const LA_LH = {
  "NAM-PE": [25000, null, 50000],
  "NAM-BR": [37500, 65000, 95000],
  "NAM-CL": [37500, 65000, 95000],
  "GB-BR": [40000, 72500, 102500],
};

// ── AF/KL zone mapping for long-haul ──
const AFKL_ZONE = {
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU", AT: "EU",
  IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU", IT: "EU", ES: "EU", PT: "EU",
  IN: "AT", ZA: "AT", KE: "AT", MV: "AT", MU: "AT", LK: "AT",
  US: "NAM", CA: "NAM", MX: "NAM",
  JP: "PA", KR: "PA", CN: "PA", HK: "PA", TW: "PA", TH: "PA", SG: "PA",
  MY: "PA", ID: "PA", PH: "PA", VN: "PA", AU: "PA", NZ: "PA",
};

function afklZoneKey(cc1, cc2) {
  const z1 = AFKL_ZONE[cc1], z2 = AFKL_ZONE[cc2];
  if (!z1 || !z2) return null;
  return z1 <= z2 ? `${z1}-${z2}` : `${z2}-${z1}`;
}

export const slug = "flying-club";

export const bookable = BOOKABLE;

// SkyTeam general and Delta partner charts are PER-SEGMENT ADDITIVE: each leg
// is banded on its own great-circle distance and the values are summed —
// verified against seats.aero (KQ BOM-NBO-CDG J = 40k + 75k = 115k observed).
function sumPerLeg(legs, bands, chart) {
  let e = 0, b = 0;
  for (const l of legs) {
    const [le, lb] = chart[resolveBand(l.distance, bands)];
    e += le;
    b += lb;
  }
  return [e, b];
}

// AF/KL short-haul bands on the DIRECT origin→final-destination distance, not
// cumulative segment distance — a connection via AMS/CDG can price at the
// lowest tier when the endpoints are close. Falls back to null when legs were
// built without coordinates.
function directDistance(legs) {
  const o = legs[0], d = legs[legs.length - 1];
  if (o.origin_lat == null || d.destination_lat == null) return null;
  return haversine(o.origin_lat, o.origin_lng, d.destination_lat, d.destination_lng);
}

export function handle(legs, totalDistance) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const entries = [];
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;

  if (carriers.length === 0) {
    const [e, b] = sumPerLeg(legs, ST_BANDS, ST_CHART);
    entries.push(makeEntry("flyingclub", "skyteam_partner", "default", e, null, b, null));
    return entries;
  }

  for (const carrier of new Set(carriers)) {
    if (VS_CARRIERS.has(carrier)) {
      const caps = getVsCaps(destCC, legs[legs.length - 1].destination)
                || getVsCaps(originCC, legs[0].origin);
      if (caps) {
        // VS own metal is DYNAMIC between a floor (VS_MIN) and the peak saver cap
        // — not two seasonal tiers. `floor: true` makes the tier model read it as
        // a capped dynamic band {from: floor, to: cap} rather than off-peak/peak.
        entries.push({
          programme: "flyingclub", chart: "own", season: "default",
          floor: true,
          economy: [VS_MIN[0], caps[0]],
          premium_economy: [VS_MIN[1], caps[1]],
          business: [VS_MIN[2], caps[2]],
          first: null,
        });
      } else {
        entries.push(makeEntry("flyingclub", "own_dynamic", "default", 0, null, 0, null));
      }

    } else if (DL_CARRIERS.has(carrier)) {
      const [e, b] = sumPerLeg(legs, DL_BANDS, DL_DIST);
      entries.push(makeEntry("flyingclub", "delta", "default", e, null, b, null));

    } else if (ANA_CARRIERS.has(carrier)) {
      // ANA — pricing differs by direction
      if (originCC === "JP") {
        // From Japan — use published zone chart
        const rates = getAnaZoneRate(destCC);
        if (rates) {
          entries.push(makeEntry("flyingclub", "ana", "default", rates[0], null, rates[1], rates[2]));
        } else {
          entries.push(makeEntry("flyingclub", "ana", "default", 0, null, 0, null));
        }
      } else if (destCC === "JP") {
        // To Japan — use origin-specific pricing where known
        const rates = getAnaToJapanRate(originCC);
        if (rates) {
          entries.push(makeEntry("flyingclub", "ana", "default", rates[0], null, rates[1], rates[2]));
        } else {
          // Fall back to Japan chart (reverse direction)
          const jpRates = getAnaZoneRate(originCC);
          if (jpRates) {
            entries.push(makeEntry("flyingclub", "ana", "default", jpRates[0], null, jpRates[1], jpRates[2]));
          } else {
            entries.push(makeEntry("flyingclub", "ana", "default", 0, null, 0, null));
          }
        }
      } else {
        // Non-Japan route — no data
        entries.push(makeEntry("flyingclub", "ana", "default", 0, null, 0, null));
      }

    } else if (AFKL_CARRIERS.has(carrier)) {
      const direct = directDistance(legs) ?? totalDistance;
      if (direct <= 1749) {
        // Short-haul: distance-based with [offpeak, peak] ranges
        const idx = resolveBand(direct, AFKL_SH_BANDS);
        const row = AFKL_SH_CHART[idx];
        entries.push({
          programme: "flyingclub", chart: "afkl", season: "default",
          economy: [row[0], row[1]], premium_economy: null,
          business: [row[2], row[3]], first: null,
        });
      } else {
        // Long-haul: zone-based with known route pairs
        const key = afklZoneKey(originCC, destCC);
        const lh = key ? AFKL_LH[key] : null;
        if (lh) {
          entries.push({
            programme: "flyingclub", chart: "afkl", season: "default",
            economy: [lh[0], lh[1]],
            premium_economy: null,
            business: lh[2] ? [lh[2], lh[3]] : null,
            first: null,
          });
        } else {
          entries.push(makeEntry("flyingclub", "afkl", "default", 0, null, 0, null));
        }
      }

    } else if (LA_CARRIERS.has(carrier)) {
      if (totalDistance <= 4000) {
        // Short-haul distance-based
        const idx = resolveBand(totalDistance, LA_SH_BANDS);
        const [e, pe, b] = LA_SH_CHART[idx];
        entries.push(makeEntry("flyingclub", "latam", "default", e, pe, b, null));
      } else {
        // Long-haul zone-based — check known route pairs
        const lhKey = getLatamLhKey(originCC, destCC);
        const lh = lhKey ? LA_LH[lhKey] : null;
        if (lh) {
          entries.push(makeEntry("flyingclub", "latam", "default", lh[0], lh[1], lh[2], null));
        } else {
          entries.push(makeEntry("flyingclub", "latam", "default", 0, null, 0, null));
        }
      }

    } else if (NZ_CARRIERS.has(carrier)) {
      // Air NZ — route-specific, no distance chart. Return [0,0].
      entries.push(makeEntry("flyingclub", "airnz", "default", 0, null, 0, null));

    } else if (SKYTEAM_PARTNERS.has(carrier)) {
      const [e, b] = sumPerLeg(legs, ST_BANDS, ST_CHART);
      entries.push(makeEntry("flyingclub", "skyteam_partner", "default", e, null, b, null));

    } else if (NO_CHART_PARTNERS.has(carrier)) {
      // Partners without published chart — return [0,0]
      entries.push(makeEntry("flyingclub", "partner_dynamic", "default", 0, null, 0, null));
    }
  }

  return entries;
}

// ANA zone rates from Japan (one-way): [economy, business, first]
function getAnaZoneRate(cc) {
  const zones = {
    JP: [7500, null, null],
    KR: [9000, 17500, 25000],
    CN: [11500, 22500, 30000], GU: [11500, 22500, 30000], HK: [11500, 22500, 30000],
    PH: [11500, 22500, 30000], TW: [11500, 22500, 30000],
    MY: [20000, 35000, 52500], MM: [20000, 35000, 52500], SG: [20000, 35000, 52500],
    TH: [20000, 35000, 52500], VN: [20000, 35000, 52500],
    IN: [22500, 37500, 57500], ID: [22500, 37500, 57500],
    AU: [30000, 52500, 72500], CA: [30000, 52500, 72500],
    GB: [32500, 60000, 85000], FR: [32500, 60000, 85000], DE: [32500, 60000, 85000],
    US: [32500, 60000, 85000], MX: [32500, 60000, 85000],
  };
  return zones[cc] || null;
}

// ANA rates TO Japan by origin country: [economy, business, first]
// From Frequent Miler video (Feb 2026): US→Japan 45K-47.5K biz, 72.5K-85K first
function getAnaToJapanRate(cc) {
  const rates = {
    US: [null, 45000, 72500], // 45K-47.5K biz, 72.5K from West Coast / 85K from East
    CA: [null, 45000, 72500],
  };
  return rates[cc] || null;
}

// LATAM long-haul key resolver
function getLatamLhKey(cc1, cc2) {
  const nam = new Set(["US","CA","MX"]);
  const isNam1 = nam.has(cc1), isNam2 = nam.has(cc2);
  if (isNam1 && cc2 === "PE") return "NAM-PE";
  if (isNam2 && cc1 === "PE") return "NAM-PE";
  if (isNam1 && cc2 === "BR") return "NAM-BR";
  if (isNam2 && cc1 === "BR") return "NAM-BR";
  if (isNam1 && cc2 === "CL") return "NAM-CL";
  if (isNam2 && cc1 === "CL") return "NAM-CL";
  if (cc1 === "GB" && cc2 === "BR") return "GB-BR";
  if (cc2 === "GB" && cc1 === "BR") return "GB-BR";
  return null;
}
