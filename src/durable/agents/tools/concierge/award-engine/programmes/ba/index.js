import { makeEntry, resolveChart, resolveBand } from "../../shared.js";

const BOOKABLE = new Set(["3M","6E","9K","AA","AS","AT","AY","B6","BA","CX","CZ","EI","EY","FJ","G3","HA","IB","JL","LA","MH","QF","QR","RJ","TN","UL","WY"]);

const BA_BANDS = [650, 1151, 2000, 3000, 4000, 5500, 6500, 7000, Infinity];

// BA/IB/EI operated — off-peak and peak. [economy, premEcon, business, first]
const BA_OWN_OFFPEAK = [
  [4750,null,8500,null],[7250,null,13500,null],[9250,null,17750,null],[10000,null,31250,null],
  [13000,26000,50000,68000],[16250,32500,62500,85000],[19500,39000,75000,102000],
  [22750,45500,87500,119000],[32500,65000,125000,170000],
];
const BA_OWN_PEAK = [
  [5250,null,9750,null],[8250,null,15750,null],[10750,null,18350,null],[12500,null,37500,null],
  [20000,40000,60000,80000],[25000,50000,75000,100000],[30000,60000,90000,120000],
  [35000,70000,105000,140000],[50000,100000,150000,200000],
];

// Standard partner chart [economy, premEcon, business, first]
const BA_PARTNER = [
  [6500,6750,14000,24000],[10000,11250,18500,33000],[12500,15000,24500,44000],
  [14500,25000,43000,51500],[23000,40000,68500,82500],[28500,50000,85500,103000],
  [34500,62000,103000,123750],[40000,72250,120000,144250],[57000,100000,171000,206000],
];

const BA_CARRIERS = new Set(["BA", "IB", "EI"]);

export const slug = "avios";

export const bookable = BOOKABLE;

export function handle(legs, _totalDistance) {
  // BA prices PER SEGMENT. A mixed own+partner itinerary prices each leg on
  // its OWN carrier's table and sums to ONE combined price — not the whole
  // journey on both tables as two alternatives. Carrier-unspecified
  // itineraries return the all-own and all-partner interpretations.
  //
  // KNOWN GAPS (unverifiable without a published chart — BA is calculator-only
  // and blogs publish images; see docs/award-audit/opus-migration-audit.md):
  // CX/JL higher partner rates, the AA/AS US-domestic table, the QR/AY
  // Dec-2025 exemption, and the multi-carrier (2+ oneworld) chart.
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const chart = resolveChart(legs, BA_CARRIERS);
  const wrap = (v) => (v === 0 ? null : [v, v]);

  const sumWith = (legIsOwn) => {
    const offpeak = { e: 0, pe: 0, b: 0, f: 0 }, peak = { e: 0, pe: 0, b: 0, f: 0 };
    for (const leg of legs) {
      const idx = resolveBand(leg.distance, BA_BANDS);
      if (legIsOwn(leg)) {
        const op = BA_OWN_OFFPEAK[idx], pk = BA_OWN_PEAK[idx];
        if (!op) return null;
        offpeak.e += op[0]; offpeak.pe += op[1] || 0; offpeak.b += op[2]; offpeak.f += op[3] || 0;
        peak.e += pk[0]; peak.pe += pk[1] || 0; peak.b += pk[2]; peak.f += pk[3] || 0;
      } else {
        const row = BA_PARTNER[idx];
        if (!row) return null;
        for (const t of [offpeak, peak]) { t.e += row[0]; t.pe += row[1]; t.b += row[2]; t.f += row[3]; }
      }
    }
    return { offpeak, peak };
  };
  const toEntries = (s, chartName) => {
    if (!s) return [];
    const mk = (season, t) => ({
      programme: "ba", chart: chartName, season,
      economy: wrap(t.e), premium_economy: wrap(t.pe), business: wrap(t.b), first: wrap(t.f),
    });
    const same = s.offpeak.e === s.peak.e && s.offpeak.pe === s.peak.pe
      && s.offpeak.b === s.peak.b && s.offpeak.f === s.peak.f;
    return same ? [mk("default", s.offpeak)] : [mk("off-peak", s.offpeak), mk("peak", s.peak)];
  };

  if (carriers.length === 0) {
    return [
      ...toEntries(sumWith(() => true), "own"),
      ...toEntries(sumWith(() => false), "partner"),
    ];
  }
  if (chart === "own") return toEntries(sumWith(() => true), "own");
  if (chart === "partner") return toEntries(sumWith(() => false), "partner");
  // Mixed itinerary: leg-by-leg carrier match; unspecified legs ride the own table.
  return toEntries(sumWith((l) => !l.carrier || BA_CARRIERS.has(l.carrier)), "mixed");
}
