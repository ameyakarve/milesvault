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
  // Qantas Classic Flight Rewards: the price is the SUM over each airline's
  // PORTION — each airline's own total flown distance → one band → that
  // airline's table. So a SINGLE-airline journey is just total distance on one
  // table; MIXED airlines sum each part (Qantas docs: "single airline = distance
  // flown"; "two partner airlines = sum of the individual airline portions";
  // "partner + Qantas/Jetstar = sum of each part"). QF/AA/Fiji share the Qantas
  // "own" table and combine into one portion; a Jetstar sector alongside them
  // rides the own table; each partner airline is its own portion; Emirates its
  // own. NOT per-segment (that double-counts within one airline's portion).
  const wrap = (v) => (v == null || v === 0 ? null : [v, v]);
  const withCarrier = legs.filter((l) => l.carrier);

  // No carrier specified — offer own/partner/emirates at the total distance.
  if (withCarrier.length === 0) {
    const i = resolveBand(totalDistance, QF_BANDS);
    if (i === undefined) return [];
    const at = (chart, name) => {
      const r = chart[i];
      return { programme: "qantas", chart: name, season: "default",
        economy: wrap(r[0]), premium_economy: wrap(r[1]), business: wrap(r[2]), first: wrap(r[3]) };
    };
    return [at(QF_OWN, "own"), at(QF_PARTNER, "partner"), at(QF_EMIRATES, "emirates")];
  }

  const hasOwn = withCarrier.some((l) => QF_CARRIERS.has(l.carrier));
  // Group flown distance by airline portion. Jetstar joins the own portion when
  // Qantas/AA/Fiji are also flown, else it's its own (Jetstar-table) portion.
  const groupDist = new Map();
  for (const l of withCarrier) {
    const c = l.carrier;
    const key = EK_CARRIERS.has(c) ? "EK"
      : QF_CARRIERS.has(c) ? "OWN"
      : JQ_CARRIERS.has(c) ? (hasOwn ? "OWN" : "JQ")
      : c; // each partner airline is its own portion
    groupDist.set(key, (groupDist.get(key) || 0) + l.distance);
  }

  const totals = { economy: 0, premium_economy: 0, business: 0, first: 0 };
  let anyPartner = false, anyEk = false, anyJq = false, anyOwn = false;
  for (const [key, dist] of groupDist) {
    const idx = resolveBand(dist, QF_BANDS);
    if (idx === undefined) return [];
    if (key === "JQ") {
      const r = QF_JETSTAR[idx]; // [economy, business] only
      totals.economy += r[0];
      totals.business += r[1];
      anyJq = true;
    } else {
      const table = key === "EK" ? QF_EMIRATES : key === "OWN" ? QF_OWN : QF_PARTNER;
      const r = table[idx];
      totals.economy += r[0];
      totals.premium_economy += r[1] || 0;
      totals.business += r[2];
      totals.first += r[3] || 0;
      if (key === "OWN") anyOwn = true;
      else if (key === "EK") anyEk = true;
      else anyPartner = true;
    }
  }

  const chartName = anyPartner ? "partner" : anyEk ? "emirates" : (anyJq && !anyOwn) ? "jetstar" : "own";
  return [{
    programme: "qantas", chart: chartName, season: "default",
    economy: wrap(totals.economy), premium_economy: wrap(totals.premium_economy),
    business: wrap(totals.business), first: wrap(totals.first),
  }];
}
