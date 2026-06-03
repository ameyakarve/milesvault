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

export const bookable = BOOKABLE;

export function handle(legs, _totalDistance) {
  // BA uses per-segment additive pricing — sum each leg independently
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const chart = resolveChart(legs, BA_CARRIERS);

  // For per-segment pricing, sum costs across all legs
  if (chart !== "partner") {
    const offpeak = { economy: 0, premium_economy: 0, business: 0, first: 0 };
    const peak = { economy: 0, premium_economy: 0, business: 0, first: 0 };
    let valid = true;

    for (const leg of legs) {
      const idx = resolveBand(leg.distance, BA_BANDS);
      const op = BA_OWN_OFFPEAK[idx];
      const pk = BA_OWN_PEAK[idx];
      if (!op) { valid = false; break; }
      offpeak.economy += op[0];
      offpeak.premium_economy += op[1] || 0;
      offpeak.business += op[2];
      offpeak.first += op[3] || 0;
      peak.economy += pk[0];
      peak.premium_economy += pk[1] || 0;
      peak.business += pk[2];
      peak.first += pk[3] || 0;
    }

    if (valid) {
      const wrap = (v) => v === 0 ? null : [v, v];
      const entries = [];
      entries.push({
        programme: "ba", chart: "own", season: "off-peak",
        economy: wrap(offpeak.economy), premium_economy: wrap(offpeak.premium_economy),
        business: wrap(offpeak.business), first: wrap(offpeak.first),
      });
      entries.push({
        programme: "ba", chart: "own", season: "peak",
        economy: wrap(peak.economy), premium_economy: wrap(peak.premium_economy),
        business: wrap(peak.business), first: wrap(peak.first),
      });
      // Return own entries separately if chart is "own" only
      if (chart === "own") return entries;
      // For "both", continue to add partner below
      var ownEntries = entries;
    }
  }

  const partnerEntries = [];
  if (chart !== "own") {
    const totals = { economy: 0, premium_economy: 0, business: 0, first: 0 };
    let valid = true;

    for (const leg of legs) {
      const idx = resolveBand(leg.distance, BA_BANDS);
      const row = BA_PARTNER[idx];
      if (!row) { valid = false; break; }
      totals.economy += row[0];
      totals.premium_economy += row[1];
      totals.business += row[2];
      totals.first += row[3];
    }

    if (valid) {
      const wrap = (v) => v === 0 ? null : [v, v];
      partnerEntries.push({
        programme: "ba", chart: "partner", season: "default",
        economy: wrap(totals.economy), premium_economy: wrap(totals.premium_economy),
        business: wrap(totals.business), first: wrap(totals.first),
      });
    }
  }

  if (chart === "both") return [...(ownEntries || []), ...partnerEntries];
  return partnerEntries;
}
