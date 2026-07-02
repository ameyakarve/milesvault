/**
 * JAL Mileage Bank
 *
 * - JL own-metal: city-pair pricing from static route data — verified row-by-row
 *   against the live jal.co.jp required-mileage chart 2026-07-02 (base awards +
 *   seasonal First; the site's third table set is the dynamic "PLUS" maximums,
 *   intentionally unmodelled).
 * - Non-oneworld partner chart: distance-based, one-way.
 * - Oneworld multi-carrier chart: ROUND-TRIP-ONLY product (like Qantas's) —
 *   cannot price the one-way itineraries this engine quotes; one-way
 *   multi-partner itineraries book on the partner chart.
 * - JL DOMESTIC awards (zone A–G chart on jal.co.jp): NOT modelled — pure
 *   domestic itineraries return []. Known gap.
 */

import { makeEntry, resolveChart, resolveBand } from "../../shared.js";
import { ROUTES, ALIASES } from "./routes.js";

const BOOKABLE = new Set(["AA","AF","AS","AT","AY","BA","CX","EK","FJ","GA","IB","JL","KE","LA","MH","PG","QF","QR","RJ","UL","WY"]);

const JL_CARRIERS = new Set(["JL"]);
const JAPAN_AIRPORTS = new Set(["NRT","HND","KIX","NGO","ITM","FUK","CTS","OKA","SDJ","KOJ","NGS","OIT","KMJ","MYJ","HIJ","TAK","TKS","KCZ","MMB","AKJ","OBO","GAJ","SHM","UBJ"]);

// Non-oneworld partner chart — distance-based, one-way
const PTR_BANDS = [1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 20000, 25000, 29000, 34000, 50000];
const PTR_CHART = [
  [12000, 17000, 24000, 36000],
  [15000, 21000, 30000, 45000],
  [23000, 30000, 42000, 65000],
  [37000, 46000, 60000, 90000],
  [45000, 59000, 80000, 120000],
  [47000, 62000, 85000, 135000],
  [50000, 70000, 100000, 145000],
  [55000, 77000, 110000, 165000],
  [70000, 94000, 130000, 190000],
  [90000, 112000, 145000, 220000],
  [110000, 135000, 160000, 250000],
  [130000, 160000, 190000, 290000],
  [150000, 180000, 210000, 330000],
];

export const slug = "jal-mileage-bank";

export const bookable = BOOKABLE;

// ── JL DOMESTIC award chart (zones A–G, one way / one flight sector) ──
// City-pair zone lists transcribed from the live jal.co.jp "Domestic Award
// Tickets required mileage chart" (2026-07-02). Values are per-sector base
// miles [economy, Class J]; Zone A economy 4,500 corroborated by JAL's own
// connecting-itinerary tables. First class and the dynamic PLUS tiers are not
// modelled; multi-sector domestic itineraries use JAL's own discounted
// itinerary lists and are not priced here.
const DOM_ZONE_MILES = { A: [4500, 5500], B: [5500, 6500], C: [6000, 7000], D: [7500, 8500], E: [8500, 9500], F: [9500, 11000], G: [10500, 12500] };
const DOM_CITY = { // JAL city label → IATA airports
  "Sapporo": ["CTS"], "Hakodate": ["HKD"], "Okushiri": ["OIR"], "Rishiri": ["RIS"],
  "Memanbetsu": ["MMB"], "Nemuro-Nakashibetsu": ["SHB"], "Kushiro": ["KUH"],
  "Asahikawa": ["AKJ"], "Obihiro": ["OBO"], "Aomori": ["AOJ"], "Misawa": ["MSJ"],
  "Akita": ["AXT"], "Hanamaki": ["HNA"], "Sendai": ["SDJ"], "Yamagata": ["GAJ"],
  "Niigata": ["KIJ"], "Tokyo": ["HND", "NRT"], "Nagoya": ["NGO"], "Matsumoto": ["MMJ"],
  "Shizuoka": ["FSZ"], "Komatsu": ["KMQ"], "Osaka": ["ITM", "KIX"],
  "Nanki-Shirahama": ["SHM"], "Tajima": ["TJH"], "Okayama": ["OKJ"], "Hiroshima": ["HIJ"],
  "Yamaguchiube": ["UBJ"], "Izumo": ["IZO"], "Oki": ["OKI"], "Tokushima": ["TKS"],
  "Takamatsu": ["TAK"], "Matsuyama": ["MYJ"], "Kochi": ["KCZ"], "Fukuoka": ["FUK"],
  "Kitakyushu": ["KKJ"], "Oita": ["OIT"], "Nagasaki": ["NGS"], "Tsushima": ["TSJ"],
  "Iki": ["IKI"], "Goto Fukue": ["FUJ"], "Kumamoto": ["KMJ"], "Amakusa": ["AXJ"],
  "Miyazaki": ["KMI"], "Kagoshima": ["KOJ"], "Tanegashima": ["TNE"], "Yakushima": ["KUM"],
  "Amamioshima": ["ASJ"], "Kikaijima": ["KKX"], "Tokunoshima": ["TKN"], "Okinoerabu": ["OKE"],
  "Yoron": ["RNJ"], "Okinawa (Naha)": ["OKA"], "Kumejima": ["UEO"], "Miyako": ["MMY"],
  "Tarama": ["TRA"], "Ishigaki": ["ISG"], "Yonaguni": ["OGN"], "Minamidaito": ["MMD"],
  "Kitadaito": ["KTD"],
};
const DOM_PAIRS = {
  A: [["Sapporo","Hakodate, Okushiri"],["Hakodate","Okushiri"],["Osaka","Tajima, Kochi"],["Izumo","Oki"],["Fukuoka","Matsuyama, Tsushima, Goto Fukue, Amakusa, Miyazaki, Kagoshima"],["Nagasaki","Tsushima, Iki, Goto Fukue"],["Kumamoto","Amakusa"],["Kagoshima","Tanegashima, Yakushima"],["Amamioshima","Kikaijima, Tokunoshima, Yoron"],["Tokunoshima","Okinoerabu"],["Okinawa (Naha)","Okinoerabu, Yoron, Kumejima"],["Ishigaki","Miyako, Yonaguni"],["Miyako","Tarama"],["Minamidaito","Kitadaito"]],
  B: [["Sapporo","Rishiri, Memanbetsu, Nemuro-Nakashibetsu, Kushiro, Aomori, Misawa"],["Tokyo","Sendai, Yamagata, Niigata, Nagoya"],["Osaka","Matsumoto, Oki, Izumo, Matsuyama"],["Matsuyama","Kagoshima"],["Fukuoka","Izumo, Kochi"],["Okinawa (Naha)","Amamioshima, Miyako"]],
  C: [["Sapporo","Akita, Hanamaki"],["Tokyo","Akita, Hanamaki, Komatsu, Osaka"],["Nagoya","Niigata, Izumo, Kochi"],["Osaka","Fukuoka, Oita, Kumamoto, Miyazaki"],["Fukuoka","Tokushima, Yakushima"],["Kagoshima","Kikaijima, Amamioshima, Tokunoshima"],["Okinawa (Naha)","Ishigaki, Kitadaito, Minamidaito"]],
  D: [["Sapporo","Sendai, Yamagata, Niigata"],["Sendai","Izumo"],["Tokyo","Hakodate, Aomori, Misawa, Nanki-Shirahama, Okayama, Izumo, Hiroshima, Tokushima, Takamatsu, Kochi, Matsuyama, Oita"],["Nagoya","Aomori, Hanamaki, Yamagata, Fukuoka, Kumamoto"],["Shizuoka","Izumo, Kumamoto, Kagoshima"],["Osaka","Akita, Hanamaki, Sendai, Yamagata, Niigata, Nagasaki, Kagoshima, Tanegashima, Yakushima"],["Fukuoka","Matsumoto, Shizuoka, Amamioshima"],["Kagoshima","Okinoerabu, Yoron"],["Okinawa (Naha)","Yonaguni"]],
  E: [["Sapporo","Matsumoto, Shizuoka, Izumo, Tokushima"],["Tokyo","Sapporo, Memanbetsu, Asahikawa, Kushiro, Obihiro, Yamaguchiube, Fukuoka, Kitakyushu, Nagasaki, Kumamoto, Miyazaki, Kagoshima"],["Nagoya","Obihiro, Kushiro, Sapporo"],["Osaka","Sapporo, Asahikawa, Hakodate, Aomori, Misawa, Amamioshima, Tokunoshima, Okinawa (Naha)"],["Fukuoka","Hanamaki, Sendai, Niigata, Okinawa (Naha)"],["Okinawa (Naha)","Okayama"]],
  F: [["Sapporo","Hiroshima"],["Tokyo","Amamioshima, Okinawa (Naha)"],["Nagoya","Okinawa (Naha)"],["Osaka","Memanbetsu, Miyako, Ishigaki"],["Fukuoka","Sapporo"],["Okinawa (Naha)","Komatsu"]],
  G: [["Tokyo","Kumejima, Miyako, Ishigaki"],["Nagoya","Miyako, Ishigaki"]],
};
const DOM_ZONE = new Map(); // "AAA|BBB" (sorted) → zone letter
for (const [zone, rows] of Object.entries(DOM_PAIRS)) {
  for (const [from, tos] of rows) {
    for (const a of DOM_CITY[from] ?? []) {
      for (const toName of tos.split(", ")) {
        for (const b of DOM_CITY[toName] ?? []) {
          DOM_ZONE.set(a < b ? a + "|" + b : b + "|" + a, zone);
        }
      }
    }
  }
}

export function handle(legs, totalDistance) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const chart = resolveChart(legs, JL_CARRIERS);

  const entries = [];

  // JL domestic (both endpoints in Japan): zone chart, single sector only.
  if (legs[0].origin_cc === "JP" && legs[legs.length - 1].destination_cc === "JP") {
    if (chart === "partner" || legs.length !== 1) return [];
    const key = legs[0].origin < legs[0].destination
      ? legs[0].origin + "|" + legs[0].destination
      : legs[0].destination + "|" + legs[0].origin;
    const zone = DOM_ZONE.get(key);
    if (!zone) return [];
    const [e, j] = DOM_ZONE_MILES[zone];
    // Class J is JAL's domestic premium cabin — surfaced as business.
    return [makeEntry("jalmb", "domestic", "default", e, null, j, null)];
  }

  // JL own-metal — city-pair lookup
  if (chart !== "partner") {
    const origin = legs[0].origin;
    const dest = legs[legs.length - 1].destination;

    // Determine which end is Japan and which is the destination
    const originIsJP = JAPAN_AIRPORTS.has(origin);
    const destIsJP = JAPAN_AIRPORTS.has(dest);
    const foreignAirport = originIsJP ? dest : (destIsJP ? origin : null);

    if (foreignAirport) {
      // Check direct route, then aliases
      let route = ROUTES[foreignAirport];
      if (!route && ALIASES[foreignAirport]) {
        route = ROUTES[ALIASES[foreignAirport]];
      }

      if (route) {
        const [e, pe, b, fL, fR, fH] = route;
        const wrap = (v) => v === 0 ? null : [v, v];
        // First class: return [low, high] range if available
        const first = (fL > 0 && fH > 0) ? [fL, fH] : null;

        entries.push({
          programme: "jalmb", chart: "own", season: "default",
          economy: wrap(e),
          premium_economy: wrap(pe),
          business: wrap(b),
          first: first,
        });
      }
    }
    // If both ends are Japan (domestic) or neither is Japan, no own-metal pricing
  }

  // Partner chart — distance-based
  if (chart !== "own") {
    const idx = resolveBand(totalDistance, PTR_BANDS);
    const [e, pe, b, f] = PTR_CHART[idx];
    entries.push(makeEntry("jalmb", "partner", "default", e, pe, b, f));
  }

  return entries;
}
