import { makeEntry, resolveBand } from "../../shared.js";

const BOOKABLE = new Set(["A3","AC","AD","CM","DE","EK","FZ","G3","GA","JL","JQ","KE","LS","MH","MK","OA","PG","QF","SA","TP","U2","UA"]);

// New Standard partner chart (March 4, 2026)
// Applies to: A3, MK, AD, PG, DE, CM, GA, G3, KE, MH, OA, SA, TP
const STD_BANDS = [300, 500, 700, 900, 1500, 2000, 3000, 4000, 5000, Infinity];
const STD_CHART = [
  [3000,6000,7500],[4500,9000,11500],[6000,12000,15000],[8000,16000,20000],
  [11000,22000,27500],[17000,34000,42500],[22500,45000,56500],[27000,54000,67500],
  [30000,60000,75000],[37500,75000,94000],
];
const STD_PARTNERS = new Set(["A3","MK","AD","PG","DE","CM","GA","G3","KE","MH","OA","SA","TP"]);

// Legacy partner chart (AC, JL, Jetstar, UA)
const LEGACY_BANDS = [250, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, Infinity];
const LEGACY_CHART = [
  [8000,null,17500],[8000,null,25000],[12000,null,35000],[18000,null,50000],
  [22000,null,65000],[26000,null,77500],[32000,null,92500],[38000,null,105000],
  [44000,null,125000],[54000,null,145000],
];
const LEGACY_PARTNERS = new Set(["AC","JL","JQ","UA"]);

// Qantas separate chart (March 4, 2026)
const QF_BANDS = [600, 1200, 2400, 3600, 4800, 5800, 7000, 8400, 9600, Infinity];
const QF_CHART = [
  [9500,14500,19500],[14000,22000,29000],[21000,33000,44000],[23500,51000,68500],
  [29000,62000,82500],[36500,74000,98500],[43500,85500,114000],[48500,98000,130500],
  [59000,114000,152000],[63500,125000,166500],
];

// Dynamic pricing partners (FZ, U2, LS) — no fixed chart
const DYNAMIC_PARTNERS = new Set(["FZ", "U2", "LS"]);

const EK_CARRIERS = new Set(["EK"]);

export const slug = "emirates-skywards";

export const bookable = BOOKABLE;

// Skywards partner rewards are priced PER DIRECT FLIGHT: "Miles stated are for
// direct flights only. Where no direct service is operated, two or more rewards
// may be required" (emirates.com partner pages, verified 2026-07-02 on the
// Qantas and GOL pages). Band each leg on its own distance and sum.
function sumPerLeg(legs, bands, chart) {
  const tot = [0, 0, 0]
  const seen = [false, false, false]
  for (const l of legs) {
    const row = chart[resolveBand(l.distance, bands)]
    for (let i = 0; i < 3; i++) if (row[i] != null) { tot[i] += row[i]; seen[i] = true }
  }
  // A cabin the chart never prices (null cells, e.g. legacy PE) stays null.
  return tot.map((v, i) => (seen[i] ? v : null))
}

export function handle(legs, distance) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const entries = [];

  // Skip own-metal chart — Emirates doesn't publish a static chart
  // Only return partner charts when a non-EK carrier is specified
  // If no carrier specified, return all applicable partner charts

  const hasEkOnly = carriers.length > 0 && carriers.every((c) => EK_CARRIERS.has(c));
  if (hasEkOnly) return []; // Own-metal only, no static chart to return

  // Determine which partner chart applies based on carrier
  const nonEkCarriers = carriers.filter((c) => !EK_CARRIERS.has(c));

  // If specific carriers given, only return charts for those carriers
  if (nonEkCarriers.length > 0) {
    for (const carrier of new Set(nonEkCarriers)) {
      if (carrier === "QF") {
        const [e, pe, b] = sumPerLeg(legs, QF_BANDS, QF_CHART);
        entries.push(makeEntry("emirates", "partner_qantas", "default", e, pe, b, null));
      } else if (LEGACY_PARTNERS.has(carrier)) {
        const [e, pe, b] = sumPerLeg(legs, LEGACY_BANDS, LEGACY_CHART);
        entries.push(makeEntry("emirates", "partner_legacy", "default", e, pe, b, null));
      } else if (carrier === "G3") {
        // GOL sells only Economy + GOL Premium (prices at the PE column) — no
        // business/first cabin exists (emirates.com GOL page, 2026-07-02).
        const [e, pe] = sumPerLeg(legs, STD_BANDS, STD_CHART);
        entries.push(makeEntry("emirates", "partner", "default", e, pe, null, null));
      } else if (STD_PARTNERS.has(carrier)) {
        const [e, pe, b] = sumPerLeg(legs, STD_BANDS, STD_CHART);
        entries.push(makeEntry("emirates", "partner", "default", e, pe, b, null));
      } else if (DYNAMIC_PARTNERS.has(carrier)) {
        // Dynamic pricing — no fixed chart, return [0,0] ranges
        entries.push(makeEntry("emirates", "partner_dynamic", "default", 0, null, 0, null));
      }
    }
  } else {
    // No carrier specified — return all three fixed charts as alternatives
    const [se, spe, sb] = sumPerLeg(legs, STD_BANDS, STD_CHART);
    entries.push(makeEntry("emirates", "partner", "default", se, spe, sb, null));

    const [le, lpe, lb] = sumPerLeg(legs, LEGACY_BANDS, LEGACY_CHART);
    entries.push(makeEntry("emirates", "partner_legacy", "default", le, lpe, lb, null));

    const [qe, qpe, qb] = sumPerLeg(legs, QF_BANDS, QF_CHART);
    entries.push(makeEntry("emirates", "partner_qantas", "default", qe, qpe, qb, null));
  }

  return entries;
}
