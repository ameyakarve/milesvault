/**
 * JetBlue TrueBlue — Revenue-based own-metal + a few redeemable partners
 *
 * JetBlue-operated (B6) awards are pure REVENUE-BASED (points ≈ cash fare at a
 * fixed ~1.3–1.4 cents/point), no distance/region chart. Cape Air (9K) is
 * JetBlue-marketed inventory priced on the same revenue engine. So own-metal is
 * quoted as "varies" (dynamic).
 *
 * TrueBlue DOES have a small set of genuinely redeemable partners with FIXED
 * region/distance award pricing (Etihad, Qatar, Icelandair, Condor, China
 * Airlines) plus United via "Blue Sky" (Oct 2025). Qatar is how TrueBlue reaches
 * India→US (via Doha). HOWEVER the published partner numbers are thin and
 * conflicting across secondary aggregators (e.g. QR US→India economy quoted
 * anywhere from ~59k to ~106k) and jetblue.com is JS-gated to scraping — so we
 * do NOT hard-code those fixed charts yet (a wrong fixed number is worse than
 * "varies"). Partners are marked dynamic until the real charts are captured.
 *
 * TODO(trueblue partners): tabulate the fixed partner charts (EY/QR/FI/DE/CI/UA)
 * once authoritatively sourced — ideally scrape jetblue.com's "Use TrueBlue
 * Points" partner award prices directly (region-based, US-centric). Also treat
 * the partner list as TIME-BOUND: JAL redemption ended 2026-04-01 and Hawaiian
 * ended 2026-03-31 (both removed here); Blue Sky/United is phasing in.
 *
 * No cabin below is First — neither B6 (Mint = business) nor any current
 * redeemable partner sells a first cabin on these awards. Mosaic status does not
 * change redemption pricing.
 *
 * Source: jetblue.com/trueblue; Frequent Miler; TPG; NerdWallet; AwardWallet
 * (2026 research).
 */

import { makeEntry } from "../../shared.js";

// B6 + Cape Air (own/marketed, revenue-based) + currently redeemable partners.
// Excludes earn-only carriers (SQ, SA) and defunct/expired ones (JAL, HA, AA).
const BOOKABLE = new Set([
  "B6", "9K", // JetBlue own + Cape Air (revenue-based)
  "EY", "QR", "FI", "DE", "CI", "UA", // redeemable partners (fixed charts — see TODO)
]);

export const slug = "trueblue";

export const bookable = BOOKABLE;

export function handle() {
  // Own metal is revenue-based; partner fixed charts are not yet reliably
  // sourced (see header TODO). Quote economy + business as "varies"; no first
  // cabin is offered on B6 or any current redeemable partner.
  return [makeEntry("trueblue", "dynamic", "default", 0, null, 0, null)];
}
