/**
 * JAL Mileage Bank
 *
 * - JL own-metal: city-pair pricing from static route data — verified row-by-row
 *   against the live jal.co.jp required-mileage chart 2026-07-02 (base awards +
 *   seasonal First; the site's third table set is the dynamic "PLUS" maximums,
 *   intentionally unmodelled).
 * - Non-oneworld partner chart: distance-based, one-way.
 * - Oneworld multi-carrier chart: ROUND-TRIP-ONLY product (like Qantas's) —
 *   cannot price the one-way itineraries this engine quotes; one-way
 *   multi-partner itineraries book on the partner chart.
 * - JL DOMESTIC awards (zone A–G chart on jal.co.jp): NOT modelled — pure
 *   domestic itineraries return []. Known gap.
 */

import { makeEntry, resolveChart, resolveBand } from "../../shared.js";
import { ROUTES, ALIASES } from "./routes.js";

const BOOKABLE = new Set(["AA","AF","AS","AT","AY","BA","CX","EK","FJ","GA","IB","JL","KE","LA","MH","PG","QF","QR","RJ","UL","WY"]);

const JL_CARRIERS = new Set(["JL"]);
const JAPAN_AIRPORTS = new Set(["NRT","HND","KIX","NGO","ITM","FUK","CTS","OKA","SDJ","KOJ","NGS","OIT","KMJ","MYJ","HIJ","TAK","TKS","KCZ","MMB","AKJ","OBO","GAJ","SHM","UBJ"]);

// Non-oneworld partner chart — distance-based, one-way
const PTR_BANDS = [1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 20000, 25000, 29000, 34000, 50000];
const PTR_CHART = [
  [12000, 17000, 24000, 36000],
  [15000, 21000, 30000, 45000],
  [23000, 30000, 42000, 65000],
  [37000, 46000, 60000, 90000],
  [45000, 59000, 80000, 120000],
  [47000, 62000, 85000, 135000],
  [50000, 70000, 100000, 145000],
  [55000, 77000, 110000, 165000],
  [70000, 94000, 130000, 190000],
  [90000, 112000, 145000, 220000],
  [110000, 135000, 160000, 250000],
  [130000, 160000, 190000, 290000],
  [150000, 180000, 210000, 330000],
];

export const slug = "jal-mileage-bank";

export const bookable = BOOKABLE;

export function handle(legs, totalDistance) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const chart = resolveChart(legs, JL_CARRIERS);

  const entries = [];

  // JL own-metal — city-pair lookup
  if (chart !== "partner") {
    const origin = legs[0].origin;
    const dest = legs[legs.length - 1].destination;

    // Determine which end is Japan and which is the destination
    const originIsJP = JAPAN_AIRPORTS.has(origin);
    const destIsJP = JAPAN_AIRPORTS.has(dest);
    const foreignAirport = originIsJP ? dest : (destIsJP ? origin : null);

    if (foreignAirport) {
      // Check direct route, then aliases
      let route = ROUTES[foreignAirport];
      if (!route && ALIASES[foreignAirport]) {
        route = ROUTES[ALIASES[foreignAirport]];
      }

      if (route) {
        const [e, pe, b, fL, fR, fH] = route;
        const wrap = (v) => v === 0 ? null : [v, v];
        // First class: return [low, high] range if available
        const first = (fL > 0 && fH > 0) ? [fL, fH] : null;

        entries.push({
          programme: "jalmb", chart: "own", season: "default",
          economy: wrap(e),
          premium_economy: wrap(pe),
          business: wrap(b),
          first: first,
        });
      }
    }
    // If both ends are Japan (domestic) or neither is Japan, no own-metal pricing
  }

  // Partner chart — distance-based
  if (chart !== "own") {
    const idx = resolveBand(totalDistance, PTR_BANDS);
    const [e, pe, b, f] = PTR_CHART[idx];
    entries.push(makeEntry("jalmb", "partner", "default", e, pe, b, f));
  }

  return entries;
}
