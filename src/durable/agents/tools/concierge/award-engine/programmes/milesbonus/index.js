/**
 * Miles+Bonus (Aegean Airlines) — COVERAGE GAP (chart not yet transcribed)
 *
 * CORRECTION (2026 web-verify): Aegean Miles+Bonus DOES use a fixed, region-based
 * Star Alliance award chart (round-trip; one-way = half), NOT dynamic pricing —
 * the earlier "no chart / dynamic" assumption was wrong. We just haven't
 * transcribed the region matrix yet, so this module returns nothing and Aegean
 * awards never surface. This is a coverage gap, not a dynamic programme.
 *
 * TODO: transcribe Aegean's Star Alliance region award chart (Y/C/F; no premium
 * economy) + its region/zone map, then price partner awards off it.
 * Source: en.aegeanair.com/milesandbonus (Star Alliance redemption chart).
 */

// Star Alliance (27 — includes OA as A3 regional partner)
const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","LH","LO","LX","MS","NH","NZ","OA","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VL","ZH"]);

export const slug = "miles-and-bonus";

export const bookable = BOOKABLE;

export function handle(legs) {
  // No published award chart — cannot compute pricing
  return [];
}
