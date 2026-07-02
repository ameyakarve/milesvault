import { makeEntry, resolveChart, resolveBand } from "../../shared.js";

const BOOKABLE = new Set(["AA","AC","AS","AT","AY","BA","CA","CX","FJ","IB","JL","LA","LH","LX","MH","NZ","OS","PG","QF","QR","RJ","UL","UO","WY","ZH"]);

const AM_TYPE2_COUNTRIES = new Set(["BD", "IN", "ID", "JP", "NP", "LK"]);

const AM_BANDS = [750, 2750, 5000, 7500, Infinity];

// Cathay-operated "Standard" award chart, one-way [economy, premEcon, business, first].
// (Choice/Tailored tiers were discontinued 30 Mar 2021 — Standard is the only
// fixed award level now, plus Miles-Plus-Cash.) Refreshed to the 1 May 2026
// devaluation; Cathay no longer publishes an official chart, so values are from
// the MileLion/SuitesMile trackers, cross-checked. Bands: 1-750, 751-2750 Type1,
// 751-2750 Type2, 2751-5000, 5001-7500, 7501+.
const AM_CATHAY = [
  [7000,11000,16000,null],[9000,18000,27000,43000],[13000,23000,33000,50000],
  [20000,39000,60000,90000],[27000,52000,91000,125000],[38000,78000,119000,160000],
];
const AM_PTR = [
  [10000,14000,20000,30000],[15000,25000,33000,53000],[17500,28000,37000,60000],
  [27000,43000,63000,100000],[40000,55000,89000,135000],[47000,80000,115000,170000],
];

const CX_CARRIERS = new Set(["CX", "KA"]);

function isType2(legs) {
  return legs.some((l) => AM_TYPE2_COUNTRIES.has(l.origin_cc) || AM_TYPE2_COUNTRIES.has(l.destination_cc));
}

export const slug = "asia-miles";

export const bookable = BOOKABLE;

export function handle(legs, distance) {
  // Asia Miles mixed-carrier: CX/KA + at most 1 partner airline
  // For 2+ distinct non-CX carriers, use oneworld multi-carrier chart (not handled here)
  const nonCxCarriers = new Set(legs.map((l) => l.carrier).filter((c) => c && !CX_CARRIERS.has(c)));
  if (nonCxCarriers.size > 1) return [];

  const chart = resolveChart(legs, CX_CARRIERS);
  const bandIdx = resolveBand(distance, AM_BANDS);
  const isSplit = bandIdx === 1;
  const arrIdx = bandIdx === 0 ? 0 : bandIdx + 1;
  const entries = [];

  if (chart !== "partner") {
    if (isSplit) {
      const row = isType2(legs) ? AM_CATHAY[2] : AM_CATHAY[1];
      entries.push(makeEntry("asiamiles", "cathay", "default", row[0], row[1], row[2], row[3]));
    } else {
      const row = AM_CATHAY[arrIdx];
      entries.push(makeEntry("asiamiles", "cathay", "default", row[0], row[1], row[2], row[3]));
    }
  }

  if (chart !== "own") {
    if (isSplit) {
      const row = isType2(legs) ? AM_PTR[2] : AM_PTR[1];
      entries.push(makeEntry("asiamiles", "partner", "default", row[0], row[1], row[2], row[3]));
    } else {
      const row = AM_PTR[arrIdx];
      entries.push(makeEntry("asiamiles", "partner", "default", row[0], row[1], row[2], row[3]));
    }
  }

  return entries;
}
