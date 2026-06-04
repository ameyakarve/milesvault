/**
 * LATAM Pass — Fully dynamic pricing
 *
 * LATAM own-metal: fully dynamic, no published chart. Return [0,0].
 * Partner awards: unpublished pricing, phone-only booking. Return [0,0].
 *
 * Partners include DL, AM, BA, CX, AY, IB, JL, LH, OS, QF, QR, RJ, LX, VS
 *
 * Source: vault Award Charts/LATAM Pass.md
 * HOW TO REFRESH: If LATAM ever re-publishes a static chart, add it here
 */

import { makeEntry } from "../../shared.js";

const BOOKABLE = new Set(["LA","DL","AM","BA","CX","AY","IB","JL","LH","OS","QF","QR","RJ","LX","VS"]);

export const slug = "latam-pass";

export const bookable = BOOKABLE;

export function handle(legs) {
  return [makeEntry("latampass", "dynamic", "default", 0, null, 0, null)];
}
