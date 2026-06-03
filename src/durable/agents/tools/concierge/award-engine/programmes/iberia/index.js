/**
 * Iberia Club (Avios) — Distance-based with 9 bands
 *
 * - Iberia own-metal: Off-Peak and Peak pricing. Returns [offpeak, peak] where known.
 * - Partner: same distance bands but no peak/off-peak
 *
 * Source: vault Award Charts/Iberia Plus.md (compiled from search results, chart removed from IB website May 2025)
 */

import { makeEntry, resolveBand } from "../../shared.js";

const BOOKABLE = new Set(["AA","AS","AT","AV","AY","BA","CX","FJ","IB","JL","LA","MH","QF","QR","RJ","UL","WY"]);

const IB_CARRIERS = new Set(["IB"]);

const IB_BANDS = [650, 1150, 2000, 3000, 4000, 5500, 6500, 7000, Infinity];

// Iberia own-metal off-peak: [comfort_econ, premEcon, business]
const IB_OFFPEAK = [
  [7000, 0, 9750],
  [12500, 0, 16500],
  [16000, 0, 22000],
  [17000, 0, 23000],
  [25000, 29500, 40500],
  [31250, 36750, 50500],
  [37250, 44000, 60500],
  [42750, 51000, 70500],
  [60000, 71000, 97000],
];

// Iberia own-metal peak (partial data, use ~1.3-1.5x for unknown)
const IB_PEAK = [
  [0, 0, 0], // Band 1 unknown
  [0, 0, 0], // Band 2 unknown
  [0, 0, 0], // Band 3 unknown
  [0, 0, 0], // Band 4 unknown
  [19500, 40250, 59000], // Band 5
  [24250, 50500, 74000], // Band 6
  [0, 0, 0], // Band 7 unknown
  [0, 0, 0], // Band 8 unknown
  [0, 0, 0], // Band 9 unknown
];

export const bookable = BOOKABLE;

export function handle(legs, _totalDistance) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const entries = [];

  // Per-segment additive (same as BA)
  const totals_op = { economy: 0, premium_economy: 0, business: 0 };
  const totals_pk = { economy: 0, premium_economy: 0, business: 0 };
  let hasPeakData = false;

  for (const leg of legs) {
    const idx = resolveBand(leg.distance, IB_BANDS);
    const op = IB_OFFPEAK[idx];
    const pk = IB_PEAK[idx];

    totals_op.economy += op[0];
    totals_op.premium_economy += op[1];
    totals_op.business += op[2];

    if (pk[0] > 0) {
      totals_pk.economy += pk[0];
      totals_pk.premium_economy += pk[1];
      totals_pk.business += pk[2];
      hasPeakData = true;
    } else {
      // Unknown peak — use offpeak as fallback
      totals_pk.economy += op[0];
      totals_pk.premium_economy += op[1];
      totals_pk.business += op[2];
    }
  }

  const wrap = (lo, hi) => lo === 0 ? null : (hasPeakData ? [lo, hi] : [lo, lo]);

  const chart = carriers.every((c) => IB_CARRIERS.has(c)) ? "own" : "partner";

  entries.push({
    programme: "iberia", chart, season: "default",
    economy: wrap(totals_op.economy, totals_pk.economy),
    premium_economy: wrap(totals_op.premium_economy, totals_pk.premium_economy),
    business: wrap(totals_op.business, totals_pk.business),
    first: null,
  });

  return entries;
}
