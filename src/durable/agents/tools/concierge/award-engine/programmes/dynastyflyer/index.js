/**
 * Dynasty Flyer (China Airlines) — Zone-based chart
 *
 * CI own-metal: zone-based from Taiwan. One-way = 50% of round-trip.
 * Partner (SkyTeam): same zone method, separate pricing (not published in vault).
 *
 * Source: vault Award Charts/Dynasty Flyer.md
 * HOW TO REFRESH: Update zone maps and charts below
 */

import { resolveChart, pairKey } from "../../shared.js";

// SkyTeam members minus OK (Czech Airlines ceased operations)
const BOOKABLE = new Set(["AF","AM","AR","CI","DL","GA","KE","KL","KQ","ME","MF","MU","QF","RO","SK","SV","UX","VN","VS"]);

const CI_CARRIERS = new Set(["CI"]);

// Zone mapping
const ZONE = {
  TW: "TW",
  HK: "HK",
  // Asia: Japan, South Korea, China, Southeast Asia, Guam, India (Delhi)
  JP: "ASIA", KR: "ASIA", CN: "ASIA",
  TH: "ASIA", VN: "ASIA", ID: "ASIA", PH: "ASIA", SG: "ASIA",
  MY: "ASIA", MM: "ASIA", KH: "ASIA", LA: "ASIA",
  IN: "ASIA",
  // North America
  US: "NAM", CA: "NAM",
  // Europe
  GB: "EU", DE: "EU", FR: "EU", NL: "EU", IT: "EU", AT: "EU", CZ: "EU",
  // Australia / New Zealand
  AU: "AUNZ", NZ: "AUNZ",
};

function getZone(cc) {
  return ZONE[cc] || null;
}

// CI own-metal one-way chart
// Key = pairKey(originZone, destZone), Value = [economy, premEcon, business]
const CI_OWN = {};
function co(a, b, e, pe, biz) { CI_OWN[pairKey(a, b)] = [e, pe, biz]; }

// Domestic Taiwan (Mandarin Airlines)
co("TW", "TW", 7500, null, null);
// Taiwan — Hong Kong
co("TW", "HK", 10000, 20000, 25000);
// Within Asia (including Guam, Delhi)
co("ASIA", "ASIA", 17500, 20000, 30000);
co("TW", "ASIA", 17500, 20000, 30000);
co("HK", "ASIA", 17500, 20000, 30000);
// Australia — New Zealand
co("AUNZ", "AUNZ", 17500, 20000, 30000);
co("TW", "AUNZ", 17500, 20000, 30000);
// Asia — North America / Europe / Australia / NZ (long-haul)
co("ASIA", "NAM", 55000, 60000, 80000);
co("ASIA", "EU", 55000, 60000, 80000);
co("TW", "NAM", 55000, 60000, 80000);
co("TW", "EU", 55000, 60000, 80000);
co("HK", "NAM", 55000, 60000, 80000);
co("HK", "EU", 55000, 60000, 80000);
co("ASIA", "AUNZ", 55000, 60000, 80000);

export const bookable = BOOKABLE;

export function handle(legs) {
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;
  const chart = resolveChart(legs, CI_CARRIERS);
  const entries = [];

  const oz = getZone(originCC);
  const dz = getZone(destCC);
  if (!oz || !dz) return [];

  const key = pairKey(oz, dz);

  // CI own-metal
  if (chart !== "partner") {
    const own = CI_OWN[key];
    if (own) {
      const [e, pe, b] = own;
      const wrap = (v) => v === null ? null : [v, v];
      entries.push({
        programme: "dynastyflyer", chart: "own", season: "default",
        economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: null,
      });
    }
  }

  // SkyTeam partner — no published chart in vault, return nothing
  // (partner pricing uses same zone method but rates not available)

  return entries;
}
