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

const BOOKABLE = new Set(["LA","JJ","DL","AM","BA","CX","AY","IB","JL","LH","OS","QF","QR","RJ","LX","VS"]);

// LATAM group own-metal codes (LATAM Pass books partners only in COMBINED
// itineraries that include a LATAM-operated leg — latam.com, sweep 2026-07-02).
const LATAM_OWN = new Set(["LA", "JJ", "4M", "XL", "4C", "PZ"]);

export const slug = "latam-pass";

export const bookable = BOOKABLE;

export function handle(legs) {
  // Partner awards exist only as combined itineraries WITH a LATAM-operated
  // leg — pure partner-only awards are not offered (latampass.latam.com).
  // Pricing itself is dynamic (no published chart).
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const hasPartner = carriers.some((c) => !LATAM_OWN.has(c));
  const hasOwn = carriers.some((c) => LATAM_OWN.has(c));
  if (hasPartner && !hasOwn) return [];
  return [makeEntry("latampass", "dynamic", "default", 0, null, 0, null)];
}
