/**
 * AAdvantage (American Airlines)
 *
 * - AA own-metal: dynamic (return published floors as [min, min])
 * - Partner awards: fixed zone-based chart, origin-dependent
 * - "Business/First" is a single column for most routes; separate First where noted
 *
 * Source: https://www.aa.com/i18n/aadvantage-program/miles/redeem/award-travel/oneworld-and-other-airline-background.jsp
 * Verified against aa.com interactive chart Mar 2026; IS origin corrections: ME PE 22.5K→20K, A2 E 22.5K→25K, SP PE 57K→57.5K
 * HOW TO REFRESH: Update the CHARTS object and AA_FLOORS below with new pricing
 */

const BOOKABLE = new Set(["AA","AS","AT","AY","BA","CX","EI","EY","FJ","G3","IB","JL","MH","QF","QR","RJ","TN","UL","WY"]);

const AA_CARRIERS = new Set(["AA"]);

// Zone assignments by country code
const ZONE = {
  US: "US", CA: "US",  // Contiguous US & Canada same zone
  MX: "MX",
  CU: "CB", DO: "CB", JM: "CB", BS: "CB", BB: "CB", TT: "CB", PR: "CB", BM: "CB",
  GT: "CA_AM", HN: "CA_AM", SV: "CA_AM", NI: "CA_AM", CR: "CA_AM", PA: "CA_AM", BZ: "CA_AM",
  CO: "SA1", EC: "SA1", PE: "SA1", BO: "SA1", GY: "SA1", SR: "SA1",
  BR: "SA2", AR: "SA2", CL: "SA2", VE: "SA2", PY: "SA2", UY: "SA2",
  // Europe (including Turkey, Morocco)
  GB: "EU", FR: "EU", DE: "EU", NL: "EU", BE: "EU", CH: "EU", AT: "EU",
  IE: "EU", DK: "EU", SE: "EU", NO: "EU", FI: "EU", IS: "EU", LU: "EU",
  IT: "EU", ES: "EU", PT: "EU", GR: "EU", PL: "EU", RO: "EU", BG: "EU",
  CZ: "EU", HU: "EU", HR: "EU", RS: "EU", SK: "EU", SI: "EU", TR: "EU",
  MA: "EU", RU: "EU",
  // Middle East
  AE: "ME", SA: "ME", QA: "ME", BH: "ME", KW: "ME", OM: "ME", JO: "ME",
  IL: "ME", EG: "ME", IQ: "ME", IR: "ME", LB: "ME", SY: "ME",
  // Indian Subcontinent
  IN: "IS", PK: "IS", BD: "IS", LK: "IS", NP: "IS", MV: "IS", AF: "IS",
  KZ: "IS", KG: "IS", TJ: "IS", TM: "IS", UZ: "IS",
  // Africa
  ZA: "AF", KE: "AF", TZ: "AF", ET: "AF", NG: "AF", GH: "AF",
  SN: "AF", CI: "AF", CM: "AF",
  // Asia Region 1 (Japan/Korea)
  JP: "A1", KR: "A1",
  // Asia Region 2 (China/SE Asia)
  CN: "A2", HK: "A2", TW: "A2", SG: "A2", TH: "A2", MY: "A2", ID: "A2",
  PH: "A2", VN: "A2", MM: "A2", KH: "A2", LA: "A2", BN: "A2", GU: "A2",
  // South Pacific
  AU: "SP", NZ: "SP", FJ: "SP", PG: "SP",
};

// Hawaii/Alaska need airport-level detection
const HI_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO","MKK","LNY"]);
const AK_AIRPORTS = new Set(["ANC","FAI","JNU","SIT","KTN","CDV","BET","OME","ADQ"]);

function getZone(cc, airport) {
  if (cc === "US") {
    if (HI_AIRPORTS.has(airport)) return "HI";
    if (AK_AIRPORTS.has(airport)) return "AK";
    return "US";
  }
  return ZONE[cc] || null;
}

// Partner chart: CHARTS[originZone][destZone] = [economy, premEcon, bizFirst, first]
// premEcon=0 means not available; first=0 means use bizFirst column
// Origin-dependent — chart varies by departure region
const CHARTS = {
  // From US & Canada
  US: {
    US: [12500, 22500, 25000, 50000],
    AK: [15000, 25000, 30000, 55000],
    HI: [22500, 50000, 55000, 80000],
    MX: [17500, 0, 27500, 52500],
    CB: [17500, 0, 27500, 52500],
    CA_AM: [17500, 0, 27500, 52500],
    SA1: [20000, 0, 30000, 55000],
    SA2: [30000, 40000, 57500, 85000],
    EU: [30000, 40000, 57500, 85000],
    ME: [40000, 62500, 70000, 115000],
    IS: [40000, 62500, 70000, 115000],
    AF: [40000, 65000, 75000, 120000],
    A1: [35000, 50000, 60000, 80000],
    A2: [37500, 50000, 70000, 110000],
    SP: [40000, 65000, 80000, 110000],
  },
  // From Europe
  EU: {
    US: [22500, 0, 57500, 85000],
    AK: [22500, 0, 60000, 85000],
    HI: [32500, 0, 80000, 115000],
    MX: [22500, 0, 60000, 85000],
    CB: [22500, 0, 60000, 85000],
    CA_AM: [22500, 0, 60000, 85000],
    SA1: [22500, 0, 60000, 85000],
    SA2: [30000, 0, 70000, 105000],
    ME: [42500, 0, 70000, 115000],
    AF: [40000, 0, 75000, 120000],
    A1: [40000, 0, 70000, 110000],
    A2: [40000, 0, 85000, 135000],
    SP: [40000, 0, 110000, 140000],
  },
  // From Indian Subcontinent (corrected Mar 2026 from official AA.com)
  IS: {
    US: [40000, 62500, 70000, 115000],
    AK: [42500, 65000, 75000, 120000],
    HI: [47500, 77500, 92500, 140000],
    MX: [45000, 67500, 80000, 130000],
    CB: [45000, 67500, 80000, 130000],
    CA_AM: [45000, 67500, 80000, 130000],
    SA1: [60000, 75000, 87500, 130000],
    SA2: [60000, 77500, 90000, 135000],
    EU: [20000, 32500, 42500, 62500],
    ME: [17500, 20000, 30000, 40000],
    AF: [30000, 40000, 55000, 80000],
    A1: [22500, 32500, 40000, 50000],
    A2: [25000, 35000, 40000, 50000],
    SP: [42500, 57500, 80000, 100000],
    IS: [17500, 20000, 30000, 40000],
  },
  // From Asia Region 1
  A1: {
    US: [40000, 0, 70000, 110000],
    AK: [40000, 0, 75000, 120000],
    HI: [47500, 0, 95000, 135000],
    MX: [30000, 0, 70000, 110000],
    CB: [30000, 0, 70000, 110000],
    CA_AM: [30000, 0, 70000, 110000],
    SA1: [30000, 0, 70000, 110000],
    SA2: [40000, 0, 85000, 135000],
    EU: [30000, 0, 57500, 85000],
    ME: [40000, 0, 70000, 115000],
    AF: [40000, 0, 75000, 120000],
    A1: [15000, 0, 30000, 60000],
    A2: [20000, 0, 35000, 70000],
    SP: [40000, 0, 80000, 110000],
  },
  // From Asia Region 2
  A2: {
    US: [40000, 0, 70000, 110000],
    AK: [40000, 0, 75000, 120000],
    HI: [47500, 0, 95000, 135000],
    MX: [30000, 0, 70000, 110000],
    CB: [30000, 0, 70000, 110000],
    CA_AM: [30000, 0, 70000, 110000],
    SA1: [30000, 0, 70000, 110000],
    SA2: [40000, 0, 85000, 135000],
    EU: [30000, 0, 57500, 85000],
    ME: [40000, 0, 70000, 115000],
    AF: [40000, 0, 75000, 120000],
    A1: [15000, 0, 30000, 60000],
    A2: [20000, 0, 35000, 70000],
    SP: [40000, 0, 80000, 110000],
  },
  // From South Pacific
  SP: {
    US: [40000, 0, 80000, 110000],
    EU: [40000, 0, 110000, 140000],
    A1: [40000, 0, 80000, 110000],
    A2: [40000, 0, 80000, 110000],
    SP: [10000, 0, 20000, 0],
  },
  // From South America
  SA1: {
    US: [22500, 0, 57500, 85000],
    SA1: [10000, 0, 20000, 30000],
    SA2: [30000, 0, 60000, 85000],
    CB: [17500, 0, 30000, 50000],
    CA_AM: [17500, 0, 30000, 50000],
    EU: [30000, 0, 57500, 85000],
  },
  SA2: {
    US: [22500, 0, 57500, 85000],
    SA2: [30000, 0, 60000, 85000],
    EU: [30000, 0, 57500, 85000],
  },
};

// AA own-metal dynamic floors [economy, premEcon, bizFirst]
const AA_FLOORS = {
  "US": [7500, 0, 15000],
  "MX": [10000, 0, 20000],
  "CB": [10000, 0, 20000],
  "CA_AM": [10000, 0, 20000],
  "SA1": [15000, 0, 30000],
  "HI": [20000, 40000, 60000],
  "AK": [20000, 40000, 60000],
  "EU": [25000, 50000, 75000],
  "SA2": [30000, 60000, 90000],
  "A1": [35000, 60000, 95000],
  "A2": [35000, 60000, 95000],
  "ME": [35000, 60000, 95000],
  "IS": [35000, 60000, 95000],
  "SP": [35000, 60000, 95000],
};

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);

  const originZone = getZone(legs[0].origin_cc, legs[0].origin);
  const destZone = getZone(legs[legs.length - 1].destination_cc, legs[legs.length - 1].destination);
  if (!originZone || !destZone) return [];

  const entries = [];

  // AA own-metal — return dynamic floors
  if (carriers.length === 0 || carriers.some((c) => AA_CARRIERS.has(c))) {
    const floor = AA_FLOORS[destZone] || AA_FLOORS[originZone];
    if (floor && carriers.every((c) => AA_CARRIERS.has(c))) {
      const [e, pe, bf] = floor;
      entries.push({
        programme: "aadvantage", chart: "own_floor", season: "default",
        economy: [e, e], premium_economy: pe ? [pe, pe] : null,
        business: [bf, bf], first: null,
      });
      return entries; // AA-only, no partner chart
    }
  }

  // Partner chart — origin-dependent
  const originChart = CHARTS[originZone];
  if (originChart) {
    const row = originChart[destZone];
    if (row) {
      const [e, pe, bf, f] = row;
      entries.push({
        programme: "aadvantage", chart: "partner", season: "default",
        economy: [e, e],
        premium_economy: pe ? [pe, pe] : null,
        business: [bf, bf],
        first: f ? [f, f] : null,
      });
      return entries;
    }
  }

  // Try reverse direction (some zone pairs are only in one direction's chart)
  const destChart = CHARTS[destZone];
  if (destChart) {
    const row = destChart[originZone];
    if (row) {
      const [e, pe, bf, f] = row;
      entries.push({
        programme: "aadvantage", chart: "partner", season: "default",
        economy: [e, e],
        premium_economy: pe ? [pe, pe] : null,
        business: [bf, bf],
        first: f ? [f, f] : null,
      });
    }
  }

  return entries;
}
