/**
 * COSMILE (STARLUX Airlines) — region-based, two regions
 *
 * - Within Asia / Between Asia & America (one-way values)
 * - Discounted bucket for the TPE–HKG / TPE–MFM short-hauls
 * - STARLUX-operated (JX) only; no interline award routing (own-metal)
 *
 * Source: milesvault-kg content/programs/cosmile.md
 */

import { makeEntry } from "../../shared.js";

// AS added: STARLUX-issued press release — "COSMILE members can now redeem mileage on Alaska flights"
const BOOKABLE = new Set(["AS","JX"]);

// [economy, premiumEconomy, business, first] — one-way award cost
const WITHIN_ASIA = [15000, 20000, 27500, 40000];
const ASIA_AMERICA = [35000, 60000, 90000, 120000];
const HK_MACAU = [7500, 10000, 20000, null]; // TPE–HKG / TPE–MFM; no First sold

// COSMILE's served Asian markets (Taiwan, Greater China, NE & SE Asia).
const ASIA_CC = new Set([
  "TW", "HK", "MO", "CN", "JP", "KR", "TH", "VN", "MY", "SG", "PH", "ID", "KH",
]);

function isHkMacauSpecial(originIata, destIata) {
  const pair = new Set([originIata, destIata]);
  return pair.has("TPE") && (pair.has("HKG") || pair.has("MFM"));
}

export const slug = "cosmile";

export const bookable = BOOKABLE;

export function handle(legs) {
  const originIata = legs[0].origin;
  const destIata = legs[legs.length - 1].destination;
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;

  let chart, name;
  if (isHkMacauSpecial(originIata, destIata)) {
    chart = HK_MACAU;
    name = "hk-macau";
  } else if (ASIA_CC.has(originCC) && ASIA_CC.has(destCC)) {
    chart = WITHIN_ASIA;
    name = "within-asia";
  } else {
    // Anything touching a non-Asian market is Asia ↔ America (STARLUX's only
    // long-haul region today).
    chart = ASIA_AMERICA;
    name = "asia-america";
  }

  const [e, pe, b, f] = chart;
  return [makeEntry("cosmile", name, "default", e, pe, b, f)];
}
