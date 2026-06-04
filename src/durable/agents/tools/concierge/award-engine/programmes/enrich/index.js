/**
 * Enrich (Malaysia Airlines) — Distance-based partner chart
 * MH own-metal uses city-pair Saver pricing (too granular, return [0,0])
 * Partner: 7-band distance chart, one-way
 */
import { makeEntry, resolveBand } from "../../shared.js";
const BOOKABLE = new Set(["AA","AS","AT","AY","BA","CX","FJ","IB","JL","MH","QF","QR","RJ","UL","WY"]);
const MH_CARRIERS = new Set(["MH"]);
const BANDS = [500, 1200, 2400, 4800, 7200, 10000, Infinity];
const CHART = [
  [6000, 10000, 15000], [8000, 15000, 20000], [15000, 25000, 35000],
  [20000, 35000, 45000], [30000, 55000, 70000], [40000, 70000, 90000],
  [50000, 90000, 120000],
];
export const slug = "enrich";

export const bookable = BOOKABLE;
export function handle(legs, totalDistance) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  if (carriers.length > 0 && carriers.every((c) => MH_CARRIERS.has(c)))
    return [makeEntry("enrich", "own_dynamic", "default", 0, null, 0, null)];
  const idx = resolveBand(totalDistance, BANDS);
  const [e, b, f] = CHART[idx];
  return [makeEntry("enrich", "partner", "default", e, null, b, f)];
}
