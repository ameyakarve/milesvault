/**
 * Sindbad (Oman Air) — Zone-based own-metal chart from Muscat
 *
 * Uses Sindbad miles (NOT Avios). Fixed zone-based pricing, 6 zones.
 * Partner awards: no published chart, return [0,0].
 *
 * Source: sindbad.omanair.com mileage calculator API (Mar 2026)
 * HOW TO REFRESH: Query sindbad.omanair.com/SindbadProd/mileageCalculator for routes
 */

import { makeEntry } from "../../shared.js";

const BOOKABLE = new Set(["AA","AC","AS","AT","AY","BA","CX","EY","FJ","IB","JL","KL","MH","QF","QR","RJ","TK","UL","WY"]);

const WY_CARRIERS = new Set(["WY"]);

// Zone mapping by destination country code (from/to Muscat)
const ZONE = {
  OM: 0,
  AE: 1, QA: 1, BH: 1,
  KW: 2, SA: 2,
  IN: 3, PK: 3,
  LK: 4, MV: 4, JO: 4, EG: 4, TR: 4, BD: 4, NP: 4, LB: 4,
  TH: 5, KE: 5, TZ: 5, GR: 5,
  GB: 6, DE: 6, FR: 6, IT: 6, CH: 6, NL: 6, DK: 6, ES: 6,
  MA: 6, MY: 6, ID: 6, PH: 6, CN: 6, AT: 6, SE: 6, PT: 6,
};

// [economy, business, businessStudio]
const CHART = [
  [6000, 10000, 0],
  [6000, 10000, 0],
  [8000, 18000, 0],
  [12000, 22000, 0],
  [14000, 24000, 0],
  [20000, 40000, 48000],
  [24000, 46000, 55000],
];

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);

  if (carriers.length > 0 && carriers.every((c) => WY_CARRIERS.has(c))) {
    const originCC = legs[0].origin_cc;
    const destCC = legs[legs.length - 1].destination_cc;
    const foreignCC = originCC === "OM" ? destCC : (destCC === "OM" ? originCC : destCC);
    const zone = ZONE[foreignCC];
    if (zone !== undefined) {
      const [e, b, bs] = CHART[zone];
      const wrap = (v) => v === 0 ? null : [v, v];
      return [{
        programme: "sindbad", chart: "own", season: "default",
        economy: wrap(e), premium_economy: null, business: wrap(b), first: wrap(bs),
      }];
    }
    return [makeEntry("sindbad", "own", "default", 0, null, 0, null)];
  }

  return [makeEntry("sindbad", "partner", "default", 0, null, 0, null)];
}
