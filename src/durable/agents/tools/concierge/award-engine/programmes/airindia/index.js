import { pairKey, makeEntry } from "../../shared.js";
import { ROUTES } from "./routes.js";

const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","ZH"]);

// Route data uses [min,max] ranges and 0 as "not available" sentinel,
// so we use a custom wrap instead of makeEntry (which only handles single values).
const wrap = (lo, hi) => (lo === 0 && hi === 0) ? null : [lo, hi];

export const slug = "maharaja-club";

export const bookable = BOOKABLE;

const AI_CARRIERS = new Set(["AI"]);

export function handle(legs) {
  const carriers = new Set(legs.map((l) => l.carrier).filter(Boolean));
  if (carriers.size > 1) return [];

  const only = [...carriers][0];
  // Star Alliance PARTNER redemptions: Air India's old Star Alliance award PDF is
  // defunct and partner pricing is now calculator-based — surface as "varies".
  // TODO(maharaja-club partner): if a verifiable partner chart reappears, add it.
  if (only && !AI_CARRIERS.has(only)) {
    return [makeEntry("maharaja-club", "partner_dynamic", "default", 0, null, 0, null)];
  }

  // OWN metal (AI-operated, or no carrier specified): fixed banded chart (ROUTES,
  // refreshed 2026-04-01 for the Maharaja Club overhaul).
  const route = ROUTES[pairKey(legs[0].origin, legs[legs.length - 1].destination)];
  if (!route) return [];

  const [eMin, eMax, peMin, peMax, bMin, bMax, fMin, fMax] = route;
  return [{
    programme: "airindia",
    chart: "airindia",
    season: "default",
    economy: wrap(eMin, eMax),
    premium_economy: wrap(peMin, peMax),
    business: wrap(bMin, bMax),
    first: wrap(fMin, fMax),
  }];
}
