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

export const bookable = BOOKABLE;

export function handle(legs) {
  return [makeEntry("velocity", "dynamic", "default", 0, null, 0, null)];
}
