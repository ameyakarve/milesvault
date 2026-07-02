import { resolveBand } from "../../shared.js";

// Verified against etihad.com "Airline Partners – Earn & redeem miles" +
// live award feed, 2026-07-02. KE/VA are no longer partners (removed upstream);
// AD/MU/ET confirmed (MU observed live); QP observed live though the page lags;
// HX per Feb-2026 sources, page omits it — kept pending clarity. DE removed
// (no source lists Condor as a redemption partner).
const BOOKABLE = new Set(["AA","AC","AD","AF","AT","B6","ET","EY","GA","GF","HU","HX","JU","KL","LY","MH","MU","NH","NZ","OZ","QP","SK","SN","SV","TP","UL","UX","VN","WY"]);

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

// Etihad Guest does not offer First-class redemptions on these partners.
const NO_FIRST_CARRIERS = new Set(["SV", "AF", "WY"]); // Saudia, Air France, Oman Air

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
// The ET_OWN chart is the Saver FLOOR (minimum): Etihad own metal is
// dynamically priced, so live rates often sit ABOVE the floor (e.g. business/
// first on peak dates read 33k/63k where the 1,001–1,500mi floor is 30k/55k) —
// that is expected, the floor is what we quote, and it matches the published
// chart (10xTravel + milesvault-kg). Partner charts are fixed floors too.
//
// Notes (verified against live award data — not action items):
//   - Gulf Air (GF) segments look dynamically priced (live data fits no fixed
//     band); approximated with the standard partner floor.
//   - Saudia (SV) economy may isolate a few thousand under the standard chart on
//     some bands, but the dedicated Saudia chart matches ours — left as-is.
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
  let sawOwn = false, sawPartner = false, noFirst = false;
  for (const leg of legs) {
    const idx = resolveBand(leg.distance, ET_BANDS);
    const own = mode ? mode === "own" : (!leg.carrier || EY_CARRIERS.has(leg.carrier));
    // First class is unavailable on the whole award if any segment flies a
    // partner Etihad Guest doesn't offer first-class redemption on.
    if (leg.carrier && NO_FIRST_CARRIERS.has(leg.carrier)) noFirst = true;
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
    // Own metal is a Saver FLOOR with dynamic pricing above it (partner charts are
    // fixed). Any own segment ⇒ the summed total is floor+dynamic → tier model
    // reads {from, to:null}. Pure-partner itineraries stay fixed.
    floor: sawOwn,
    economy: [economy, economy],
    // Premium economy exists only on the partner chart — null if any own segment.
    premium_economy: sawOwn ? null : [premium, premium],
    business: [business, business],
    // First unavailable if any segment flies SV/AF/WY (no first-class redemption).
    first: noFirst ? null : [first, first],
  };
}
