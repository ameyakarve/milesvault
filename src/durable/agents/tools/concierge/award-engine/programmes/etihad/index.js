import { resolveBand } from "../../shared.js";

const BOOKABLE = new Set(["AA","AC","AD","AF","AT","B6","DE","ET","EY","GA","GF","HU","HX","JU","KL","LY","MH","MU","NH","NZ","OZ","SK","SN","SV","TP","UL","UX","VN","WY"]);

const ET_BANDS = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, Infinity];
// Etihad-operated ("own metal") Saver floors by distance band: [economy, business, first]
const ET_OWN = [
  [5000,15000,30000],[10000,20000,40000],[13000,30000,55000],[15000,35000,80000],
  [20000,45000,90000],[25000,60000,110000],[30000,70000,120000],[37000,75000,135000],
  [45000,95000,140000],[60000,120000,160000],
];
// Partner-operated floors by distance band: [economy, premium_economy, business, first]
const ET_PTR = [
  [6000,7500,20000,35000],[12000,13000,25000,40000],[15000,19000,30000,45000],
  [23000,25000,40000,54000],[28000,31000,50000,67000],[34000,37000,60000,80000],
  [45000,49000,80000,107000],[60000,62000,100000,134000],[67000,74000,120000,160000],
  [75000,90000,140000,200000],
];

const EY_CARRIERS = new Set(["EY"]);

export const slug = "etihad-guest";

export const bookable = BOOKABLE;

// Etihad Guest prices each SEGMENT independently and sums them — an
// Etihad-operated segment on the own-metal chart, a partner-operated segment on
// the partner chart, each by that segment's own distance band. It is NOT priced
// on total O&D distance, and mixed Etihad+partner itineraries ARE allowed
// (each leg simply uses its operator's chart). Confirmed against live award
// data. Own metal has no premium-economy award cabin, so premium economy is
// only offered when every segment is partner-operated.
//
// Known residuals (see docs/award-audit/programmes/etihad.md), left for a
// follow-up chart-data pass rather than baked in here:
//   - Gulf Air (GF) and Saudia (SV) partner segments price a few thousand off
//     the standard partner chart.
//   - Own-metal business/first in the 1,001–1,500mi band read slightly higher
//     in live data (33k/63k) than the published floor (30k/55k).
export function handle(legs) {
  const anyCarrier = legs.some((l) => l.carrier);
  // Carriers unspecified (fan-out with no operating carrier): offer both an
  // all-own and an all-partner quote so the caller sees each possibility.
  if (!anyCarrier) {
    return [sumSegments(legs, "own"), sumSegments(legs, "partner")];
  }
  return [sumSegments(legs, null)];
}

// mode: "own" | "partner" | null (null = decide per leg by its operating carrier)
function sumSegments(legs, mode) {
  let economy = 0, premium = 0, business = 0, first = 0;
  let sawOwn = false, sawPartner = false;
  for (const leg of legs) {
    const idx = resolveBand(leg.distance, ET_BANDS);
    const own = mode ? mode === "own" : (!leg.carrier || EY_CARRIERS.has(leg.carrier));
    if (own) {
      sawOwn = true;
      const [e, b, f] = ET_OWN[idx];
      economy += e; business += b; first += f;
    } else {
      sawPartner = true;
      const [e, pe, b, f] = ET_PTR[idx];
      economy += e; premium += pe; business += b; first += f;
    }
  }
  const chart = sawOwn && sawPartner ? "mixed" : sawOwn ? "own" : "partner";
  return {
    programme: "etihad",
    chart,
    season: "default",
    economy: [economy, economy],
    // Premium economy exists only on the partner chart — null if any own segment.
    premium_economy: sawOwn ? null : [premium, premium],
    business: [business, business],
    first: [first, first],
  };
}
