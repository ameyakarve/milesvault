import { pairKey } from "../../shared.js";
import { ROUTES } from "./routes.js";

const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","ZH"]);

// Route data uses [min,max] ranges and 0 as "not available" sentinel,
// so we use a custom wrap instead of makeEntry (which only handles single values).
const wrap = (lo, hi) => (lo === 0 && hi === 0) ? null : [lo, hi];

export const slug = "maharaja-club";

// Air India overhauled Maharaja Club on 2026-04-01 and the old Star Alliance award
// PDF appears to be defunct — pricing now comes from Air India's points calculator,
// so we can't confirm the ROUTES values below are the live rates (the US economy
// floor of 40k did match the announced new rate, but business/first are unverified).
// Mark the whole programme as VARIES (dynamic) rather than assert unconfirmed fixed
// fares: the ROUTES table still gates which routes/cabins are bookable, but every
// cabin surfaces as "varies".
//
// TODO(maharaja-club): verify current pricing against Air India's live points
// calculator (airindia.com/.../points-calculator). The Star Alliance redemption
// PDF is no longer the source. If a verifiable fixed/banded chart exists, restore
// concrete values and remove this flag; otherwise keep dynamic.
export const published = false;

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = new Set(legs.map((l) => l.carrier).filter(Boolean));
  if (carriers.size > 1) return [];

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
