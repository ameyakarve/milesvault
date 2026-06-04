import { makeEntry, resolveChart, resolveBand } from "../../shared.js";

// Initial set — will be updated after deep research
const BOOKABLE = new Set(["AA","AF","AS","AT","AY","BA","CI","CX","EK","FJ","HA","IB","JL","KL","LA","LY","MH","MU","NZ","PG","QF","QR","RJ","UL","WS","WY"]);

const QF_BANDS = [600, 1200, 2400, 3600, 4800, 5800, 7000, 8400, 9600, 15000];

// Qantas/AA/FJ operated — [economy, premEcon, business, first]
const QF_OWN = [
  [9200,14500,19300,29000],[13800,21600,29000,43600],[20700,32600,43600,65300],
  [23300,50600,68400,102600],[29000,61600,82100,123100],[36200,73800,98400,147700],
  [43200,85300,113900,170800],[48200,97600,130100,195400],[58900,113900,151800,227800],
  [63500,124700,166300,249400],
];

// Partner chart — [economy, premEcon, business, first]
const QF_PARTNER = [
  [11500,16600,21000,30500],[16100,24900,31500,45700],[23000,36200,46000,67700],
  [28200,58200,73400,107800],[34700,70800,90000,129200],[43500,85000,108000,155200],
  [51800,98200,125400,179800],[57800,112200,143000,205000],[70700,130800,167000,239200],
  [76100,143500,182900,261600],
];

// Emirates chart (effective March 31, 2026) — [economy, premEcon, business, first]
const QF_EMIRATES = [
  [10200,18900,21000,34800],[15200,28400,31500,52400],[22800,41400,46000,78400],
  [25700,66100,73400,123200],[31900,81000,90000,147800],[39900,97200,108000,177300],
  [47600,112900,125400,205000],[53100,128700,143000,234500],[64800,150300,167000,273400],
  [69900,164700,182900,299300],
];

// Jetstar chart — [economy, business] (no PE or First)
const QF_JETSTAR = [
  [5700,14500],[11000,21600],[16600,32600],[20700,50600],[24700,61600],
  [29900,73800],[36800,85300],[40900,97600],[50000,113900],[53900,124700],
];

const QF_CARRIERS = new Set(["QF", "AA", "FJ"]);
const EK_CARRIERS = new Set(["EK"]);
const JQ_CARRIERS = new Set(["JQ", "GK", "3K"]); // Jetstar variants

export const slug = "qantas-frequent-flyer";

export const bookable = BOOKABLE;

export function handle(legs, _totalDistance) {
  // Per-segment additive pricing — sum each leg independently
  const carriers = legs.map((l) => l.carrier).filter(Boolean);

  // Determine which chart to use based on carriers
  const hasQf = carriers.some((c) => QF_CARRIERS.has(c));
  const hasEk = carriers.some((c) => EK_CARRIERS.has(c));
  const hasJq = carriers.some((c) => JQ_CARRIERS.has(c));
  const hasPartner = carriers.some((c) => !QF_CARRIERS.has(c) && !EK_CARRIERS.has(c) && !JQ_CARRIERS.has(c));

  const entries = [];

  // If no carrier specified, return all charts for the per-leg distances
  if (carriers.length === 0) {
    const qfTotals = sumChart(legs, QF_OWN);
    if (qfTotals) entries.push(makeChartEntry("qantas", "own", qfTotals));
    const pTotals = sumChart(legs, QF_PARTNER);
    if (pTotals) entries.push(makeChartEntry("qantas", "partner", pTotals));
    const eTotals = sumChart(legs, QF_EMIRATES);
    if (eTotals) entries.push(makeChartEntry("qantas", "emirates", eTotals));
    return entries;
  }

  // Carrier specified — use appropriate chart per leg
  const totals = { economy: 0, premium_economy: 0, business: 0, first: 0 };
  let chartName = "partner";
  let valid = true;

  for (const leg of legs) {
    const idx = resolveBand(leg.distance, QF_BANDS);
    if (idx === undefined) { valid = false; break; }

    const c = leg.carrier;
    let row;
    if (c && EK_CARRIERS.has(c)) {
      row = QF_EMIRATES[idx];
      chartName = "emirates";
    } else if (c && QF_CARRIERS.has(c)) {
      row = QF_OWN[idx];
      chartName = "own";
    } else if (c && JQ_CARRIERS.has(c)) {
      const jr = QF_JETSTAR[idx];
      totals.economy += jr[0];
      totals.business += jr[1];
      chartName = "jetstar";
      continue;
    } else {
      row = QF_PARTNER[idx];
      chartName = "partner";
    }

    totals.economy += row[0];
    totals.premium_economy += row[1] || 0;
    totals.business += row[2];
    totals.first += row[3] || 0;
  }

  if (!valid) return [];

  const wrap = (v) => v === 0 ? null : [v, v];
  entries.push({
    programme: "qantas", chart: chartName, season: "default",
    economy: wrap(totals.economy), premium_economy: wrap(totals.premium_economy),
    business: wrap(totals.business), first: wrap(totals.first),
  });

  return entries;
}

function sumChart(legs, chart) {
  const totals = { economy: 0, premium_economy: 0, business: 0, first: 0 };
  for (const leg of legs) {
    const idx = resolveBand(leg.distance, QF_BANDS);
    if (idx === undefined) return null;
    const row = chart[idx];
    totals.economy += row[0];
    totals.premium_economy += row[1] || 0;
    totals.business += row[2];
    totals.first += row[3] || 0;
  }
  return totals;
}

function makeChartEntry(programme, chart, totals) {
  const wrap = (v) => v === 0 ? null : [v, v];
  return {
    programme, chart, season: "default",
    economy: wrap(totals.economy), premium_economy: wrap(totals.premium_economy),
    business: wrap(totals.business), first: wrap(totals.first),
  };
}
