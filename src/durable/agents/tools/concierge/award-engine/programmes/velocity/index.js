/**
 * Velocity Frequent Flyer (Virgin Australia) — Dynamic pricing
 *
 * VA own-metal: fully dynamic, no published chart. Return [0,0].
 * Partners: EY, DL, SQ, HU — also dynamic/no published chart.
 *
 * Source: vault Frequent Flyer Programmes/Velocity Frequent Flyer.md
 * HOW TO REFRESH: If VA ever publishes a static chart, add it here
 */

import { makeEntry } from "../../shared.js";

const BOOKABLE = new Set(["AC","HU","HX","NH","QR","SA","SG","SQ","UA","VA","VS"]);

export const slug = "velocity-frequent-flyer";

export const bookable = BOOKABLE;

export function handle(legs) {
  // Fully dynamic across every cabin — VA has no published chart and its
  // partners (SQ/EY/QR/…) sell premium economy and first too, so quote all four
  // cabins as "varies" rather than nulling premium economy / first.
  return [makeEntry("velocity", "dynamic", "default", 0, 0, 0, 0)];
}
