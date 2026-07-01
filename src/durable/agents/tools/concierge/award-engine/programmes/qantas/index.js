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

export function handle(legs, totalDistance) {
  // Qantas Classic Flight Rewards price on the TOTAL distance flown in ONE band
  // (not per-segment additive) — confirmed against Qantas's published rule and
  // live seats.aero floors. One band lookup on the whole journey.
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const idx = resolveBand(totalDistance, QF_BANDS);
  if (idx === undefined) return [];

  // [e, pe, b, f] chart row → entry (0 → null).
  const entry = (chart, name) => {
    const r = chart[idx];
    const wrap = (v) => (v == null || v === 0 ? null : [v, v]);
    return {
      programme: "qantas", chart: name, season: "default",
      economy: wrap(r[0]), premium_economy: wrap(r[1]), business: wrap(r[2]), first: wrap(r[3]),
    };
  };

  // No carrier specified — offer own + partner + emirates at the total-distance band.
  if (carriers.length === 0) {
    return [entry(QF_OWN, "own"), entry(QF_PARTNER, "partner"), entry(QF_EMIRATES, "emirates")];
  }

  // One chart for the whole journey, by the carriers flown: any true partner →
  // partner chart; else Emirates → emirates; else all-Jetstar → jetstar; else
  // Qantas/AA/Fiji (incl. a Jetstar sector alongside them) → own.
  const hasPartner = carriers.some(
    (c) => !QF_CARRIERS.has(c) && !EK_CARRIERS.has(c) && !JQ_CARRIERS.has(c),
  );
  const hasEk = carriers.some((c) => EK_CARRIERS.has(c));
  const allJq = carriers.every((c) => JQ_CARRIERS.has(c));

  if (hasPartner) return [entry(QF_PARTNER, "partner")];
  if (hasEk) return [entry(QF_EMIRATES, "emirates")];
  if (allJq) {
    const r = QF_JETSTAR[idx]; // [economy, business] only
    const wrap = (v) => (v === 0 ? null : [v, v]);
    return [{
      programme: "qantas", chart: "jetstar", season: "default",
      economy: wrap(r[0]), premium_economy: null, business: wrap(r[1]), first: null,
    }];
  }
  return [entry(QF_OWN, "own")];
}
