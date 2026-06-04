import { pairKey } from "../../shared.js";
import { ROUTES } from "./routes.js";

const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","LH","LO","LX","MS","NH","NZ","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","ZH"]);

// Route data uses [min,max] ranges and 0 as "not available" sentinel,
// so we use a custom wrap instead of makeEntry (which only handles single values).
const wrap = (lo, hi) => (lo === 0 && hi === 0) ? null : [lo, hi];

export const slug = "maharaja-club";

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
