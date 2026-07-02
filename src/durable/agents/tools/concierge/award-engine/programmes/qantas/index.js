import { makeEntry, resolveChart, resolveBand } from "../../shared.js";

// JQ/GK/3K (Jetstar family) verified bookable 2026-07-02: 421 live Jetstar trips
// observed via the Qantas award feed, priced exactly off the Jetstar chart.
const BOOKABLE = new Set(["3K","AA","AF","AS","AT","AY","BA","CI","CX","EK","FJ","GK","HA","IB","JL","JQ","KL","LA","LY","MH","MU","NZ","PG","QF","QR","RJ","UL","WS","WY"]);

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
const PE_PARTNERS = new Set(["AA", "BA", "CX", "CI", "LY", "AY", "IB", "JL"]);
const EK_CARRIERS = new Set(["EK"]);
const JQ_CARRIERS = new Set(["JQ", "GK", "3K"]); // Jetstar variants

export const slug = "qantas-frequent-flyer";

export const bookable = BOOKABLE;

export function handle(legs, totalDistance) {
  // NOT MODELLED: the oneworld Classic Flight Reward chart (2+ oneworld
  // carriers besides QF) — it is ROUND-TRIP-ONLY (return leg required, up to 5
  // stopovers, 35,000-mile cap), so it cannot price the one-way itineraries
  // this engine quotes. One-way multi-partner itineraries book as ordinary
  // partner awards, which the portion-sum below prices correctly.
  //
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

  // QF-family itineraries (Qantas/AA/Fiji/Jetstar only): price at the LOWER of
  // (a) the Qantas table on TOTAL journey distance, or (b) the per-segment sum,
  // each segment on its own airline's table — "the Qantas table applies to total
  // distance, but if summing individual segments is cheaper, that lower price
  // wins". Verified live 2026-07-02: SYD-MEL+MEL-OOL all-Jetstar = 16,700
  // (segment sum wins); SYD-MEL+MEL-DPS = 23,300 (QF-on-total wins); mixed
  // QF+JQ priced identically to all-JQ. (Some Bali connections observed at
  // 24,500 fit neither candidate — unexplained, see audit doc.)
  const isQfFamily = withCarrier.every((l) => QF_CARRIERS.has(l.carrier) || JQ_CARRIERS.has(l.carrier));
  if (isQfFamily) {
    const ti = resolveBand(totalDistance, QF_BANDS);
    if (ti === undefined) return [];
    const onTotal = QF_OWN[ti];
    const allJq = withCarrier.every((l) => JQ_CARRIERS.has(l.carrier));
    // Per-segment candidate only when every leg has a known carrier.
    let seg = null;
    if (withCarrier.length === legs.length) {
      seg = { y: 0, pe: 0, j: 0, f: 0, hasPeF: true };
      for (const l of legs) {
        const si = resolveBand(l.distance, QF_BANDS);
        if (si === undefined) { seg = null; break; }
        if (JQ_CARRIERS.has(l.carrier)) {
          const r = QF_JETSTAR[si];
          seg.y += r[0]; seg.j += r[1]; seg.hasPeF = false;
        } else {
          const r = QF_OWN[si];
          seg.y += r[0]; seg.pe += r[1]; seg.j += r[2]; seg.f += r[3];
        }
      }
    }
    const min2 = (a, b) => (b == null ? a : Math.min(a, b));
    const y = min2(onTotal[0], seg ? seg.y : null);
    const j = min2(onTotal[2], seg ? seg.j : null);
    // Jetstar sells no Premium Economy or First: a pure-Jetstar itinerary has
    // neither cabin regardless of what the QF table would charge.
    const pe = allJq ? null : min2(onTotal[1], seg && seg.hasPeF ? seg.pe : null);
    const f = allJq ? null : min2(onTotal[3], seg && seg.hasPeF ? seg.f : null);
    return [{
      programme: "qantas", chart: allJq ? "jetstar" : "own", season: "default",
      economy: wrap(y), premium_economy: wrap(pe), business: wrap(j), first: wrap(f),
    }];
  }

  // Partner/Emirates itineraries: sum per-airline PORTIONS — each airline's own
  // flown distance → one band → that airline's table ("two partner airlines =
  // sum of the individual airline portions"; "partner + Qantas/Jetstar = sum of
  // each part"). Jetstar alongside partners rides the own table.
  const groupDist = new Map();
  for (const l of withCarrier) {
    const c = l.carrier;
    const key = EK_CARRIERS.has(c) ? "EK"
      : QF_CARRIERS.has(c) || JQ_CARRIERS.has(c) ? "OWN"
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
      // Premium Economy Classic Rewards exist only on specific partners
      // (AA/BA/CX/CI/LY + AY/IB added Feb 2026 + JL; AF/KL announced but never
      // added) — other partners' PE cabins aren't bookable with points.
      const peOk = key === "EK" || key === "OWN" || PE_PARTNERS.has(key);
      totals.premium_economy += peOk ? (r[1] || 0) : 0;
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
