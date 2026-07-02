import { makeEntry, resolveChart, pairKey } from "../../shared.js";

// AZ added: ana.co.jp — "ITA Airways (AZ) eligible for award booking from April 1, 2026"
const BOOKABLE = new Set(["A3","AC","AI","AV","AZ","BR","CA","CM","EN","ET","EW","EY","HO","LH","LO","LX","MS","NH","NX","NZ","OA","OS","OU","OZ","PR","SA","SN","SQ","TG","TK","TP","UA","VA","VL","VN","VS","ZH"]);

const HAWAII_AIRPORTS = new Set(["HNL","OGG","KOA","LIH","ITO","MKK","LNY","JHM","HPH"]);

const ANA_ZONE = {
  JP: "Japan", KR: "South Korea",
  CN: "Asia 1", HK: "Asia 1", TW: "Asia 1", PH: "Asia 1", MO: "Asia 1",
  IN: "Asia 2", TH: "Asia 2", SG: "Asia 2", MY: "Asia 2", ID: "Asia 2",
  VN: "Asia 2", MM: "Asia 2", KH: "Asia 2", LA: "Asia 2", BN: "Asia 2",
  BD: "Asia 2", NP: "Asia 2", LK: "Asia 2", PK: "Asia 2", MV: "Asia 2",
  KZ: "Asia 2", UZ: "Asia 2", TM: "Asia 2", KG: "Asia 2", TJ: "Asia 2",
  AF: "Asia 2", MN: "Asia 2", TL: "Asia 2",
  US: "North America", CA: "North America", MX: "North America",
  GB: "Europe", FR: "Europe", DE: "Europe", NL: "Europe", BE: "Europe",
  CH: "Europe", AT: "Europe", IE: "Europe", DK: "Europe", SE: "Europe",
  NO: "Europe", FI: "Europe", LU: "Europe", IS: "Europe", IT: "Europe",
  ES: "Europe", PT: "Europe", GR: "Europe", PL: "Europe", RO: "Europe",
  BG: "Europe", CZ: "Europe", HU: "Europe", HR: "Europe", RS: "Europe",
  SK: "Europe", SI: "Europe", BA: "Europe", ME: "Europe", MK: "Europe",
  AL: "Europe", XK: "Europe", LT: "Europe", LV: "Europe", EE: "Europe",
  CY: "Europe", MT: "Europe", MD: "Europe", UA: "Europe", BY: "Europe",
  GE: "Europe", AM: "Europe", AZ: "Europe", RU: "Europe", TR: "Europe",
  MA: "Europe", TN: "Europe", DZ: "Europe", LY: "Europe", EG: "Europe",
  AE: "Middle East / Africa", SA: "Middle East / Africa", QA: "Middle East / Africa",
  BH: "Middle East / Africa", KW: "Middle East / Africa", OM: "Middle East / Africa",
  JO: "Middle East / Africa", LB: "Middle East / Africa", IQ: "Middle East / Africa",
  IR: "Middle East / Africa", IL: "Middle East / Africa", PS: "Middle East / Africa",
  YE: "Middle East / Africa", SY: "Middle East / Africa",
  NG: "Middle East / Africa", GH: "Middle East / Africa", SN: "Middle East / Africa",
  CI: "Middle East / Africa", CM: "Middle East / Africa", ZA: "Middle East / Africa",
  KE: "Middle East / Africa", TZ: "Middle East / Africa", ET: "Middle East / Africa",
  MZ: "Middle East / Africa", ZW: "Middle East / Africa", ZM: "Middle East / Africa",
  UG: "Middle East / Africa", RW: "Middle East / Africa", MG: "Middle East / Africa",
  MU: "Middle East / Africa", SC: "Middle East / Africa", DJ: "Middle East / Africa",
  SD: "Middle East / Africa", SS: "Middle East / Africa", SO: "Middle East / Africa",
  ER: "Middle East / Africa", AO: "Middle East / Africa", CD: "Middle East / Africa",
  CG: "Middle East / Africa", GA: "Middle East / Africa", TD: "Middle East / Africa",
  CF: "Middle East / Africa", BW: "Middle East / Africa", NA: "Middle East / Africa",
  MW: "Middle East / Africa", SZ: "Middle East / Africa", LS: "Middle East / Africa",
  BI: "Middle East / Africa", RE: "Middle East / Africa", KM: "Middle East / Africa",
  BR: "Central / South America", AR: "Central / South America", CL: "Central / South America",
  CO: "Central / South America", PE: "Central / South America", VE: "Central / South America",
  EC: "Central / South America", BO: "Central / South America", PY: "Central / South America",
  UY: "Central / South America", GY: "Central / South America", SR: "Central / South America",
  GF: "Central / South America", PA: "Central / South America", CR: "Central / South America",
  GT: "Central / South America", HN: "Central / South America", SV: "Central / South America",
  NI: "Central / South America", BZ: "Central / South America", CU: "Central / South America",
  DO: "Central / South America", HT: "Central / South America", JM: "Central / South America",
  TT: "Central / South America", BS: "Central / South America", BB: "Central / South America",
  AG: "Central / South America", LC: "Central / South America", PR: "Central / South America",
  AW: "Central / South America", CW: "Central / South America",
  AU: "Oceania", NZ: "Oceania", FJ: "Oceania", PG: "Oceania", WS: "Oceania",
  TO: "Oceania", VU: "Oceania", SB: "Oceania", NC: "Oceania", PF: "Oceania",
  GU: "Asia 1",
};

function getZone(cc, airport) {
  if (cc === "US" && HAWAII_AIRPORTS.has(airport)) return "Hawaii";
  return ANA_ZONE[cc] || null;
}

const ANA_OWN = {};
function ao(a, b, seasons) { ANA_OWN[pairKey(a, b)] = seasons; }

ao("Japan", "South Korea", {
  L: { economy: 12000, premium_economy: null, business: 36000, first: null },
  R: { economy: 15000, premium_economy: null, business: 41000, first: null },
  H: { economy: 24000, premium_economy: null, business: 50000, first: null },
});
ao("Japan", "Asia 1", {
  L: { economy: 17000, premium_economy: 30000, business: 48000, first: null },
  R: { economy: 20000, premium_economy: 33000, business: 53000, first: null },
  H: { economy: 30000, premium_economy: 47000, business: 65000, first: null },
});
ao("Japan", "Asia 2", {
  L: { economy: 30000, premium_economy: 46000, business: 80000, first: 115000 },
  R: { economy: 35000, premium_economy: 51000, business: 85000, first: 120000 },
  H: { economy: 50000, premium_economy: 71000, business: 95000, first: 171000 },
});
ao("Japan", "Hawaii", {
  L: { economy: 35000, premium_economy: 53000, business: 80000, first: 120000 },
  R: { economy: 40000, premium_economy: 58000, business: 85000, first: 140000 },
  H: { economy: 65000, premium_economy: 88000, business: 135000, first: 240000 },
});
ao("Japan", "North America", {
  L: { economy: 40000, premium_economy: 62000, business: 100000, first: 150000 },
  R: { economy: 50000, premium_economy: 72000, business: 105000, first: 170000 },
  H: { economy: 72000, premium_economy: 101000, business: 165000, first: 300000 },
});
ao("Japan", "Europe", {
  L: { economy: 45000, premium_economy: 67000, business: 110000, first: 165000 },
  R: { economy: 55000, premium_economy: 77000, business: 115000, first: 190000 },
  H: { economy: 78000, premium_economy: 107000, business: 180000, first: 330000 },
});
ao("Japan", "Oceania", {
  L: { economy: 37000, premium_economy: 54000, business: 80000, first: null },
  R: { economy: 45000, premium_economy: 62000, business: 90000, first: null },
  H: { economy: 65000, premium_economy: 88000, business: 135000, first: null },
});
ao("South Korea", "Asia 1", {
  L: { economy: 27000, premium_economy: 39000, business: 63000, first: null },
  R: { economy: 30000, premium_economy: 42000, business: 67000, first: null },
  H: { economy: 44000, premium_economy: 56000, business: 81000, first: null },
});
ao("South Korea", "Asia 2", {
  L: { economy: 40000, premium_economy: 55000, business: 95000, first: 145000 },
  R: { economy: 45000, premium_economy: 60000, business: 99000, first: 150000 },
  H: { economy: 64000, premium_economy: 80000, business: 111000, first: 201000 },
});
ao("South Korea", "Hawaii", {
  L: { economy: 40000, premium_economy: 60000, business: 95000, first: 150000 },
  R: { economy: 50000, premium_economy: 70000, business: 107000, first: 189000 },
  H: { economy: 81000, premium_economy: 102000, business: 161000, first: 276000 },
});
ao("South Korea", "North America", {
  L: { economy: 45000, premium_economy: 66000, business: 108000, first: 165000 },
  R: { economy: 55000, premium_economy: 76000, business: 114000, first: 185000 },
  H: { economy: 79000, premium_economy: 105000, business: 173000, first: 315000 },
});
ao("South Korea", "Europe", {
  L: { economy: 50000, premium_economy: 71000, business: 119000, first: 180000 },
  R: { economy: 60000, premium_economy: 81000, business: 123000, first: 205000 },
  H: { economy: 85000, premium_economy: 111000, business: 188000, first: 345000 },
});
ao("South Korea", "Oceania", {
  L: { economy: 40000, premium_economy: 62000, business: 95000, first: null },
  R: { economy: 50000, premium_economy: 72000, business: 101000, first: null },
  H: { economy: 72000, premium_economy: 98000, business: 148000, first: null },
});
ao("Asia 1", "Asia 2", {
  L: { economy: 40000, premium_economy: 55000, business: 95000, first: 145000 },
  R: { economy: 45000, premium_economy: 60000, business: 99000, first: 150000 },
  H: { economy: 64000, premium_economy: 80000, business: 111000, first: 201000 },
});
ao("Asia 2", "North America", {
  L: { economy: 55000, premium_economy: 84000, business: 137000, first: 200000 },
  R: { economy: 65000, premium_economy: 94000, business: 143000, first: 222000 },
  H: { economy: 92000, premium_economy: 130000, business: 204000, first: 368000 },
});
ao("Asia 2", "Europe", {
  L: { economy: 60000, premium_economy: 88000, business: 148000, first: 215000 },
  R: { economy: 70000, premium_economy: 98000, business: 152000, first: 242000 },
  H: { economy: 98000, premium_economy: 135000, business: 218000, first: 398000 },
});
ao("Asia 2", "Oceania", {
  L: { economy: 50000, premium_economy: 78000, business: 124000, first: 190000 },
  R: { economy: 60000, premium_economy: 88000, business: 133000, first: 195000 },
  H: { economy: 85000, premium_economy: 123000, business: 181000, first: 252000 },
});
ao("North America", "Oceania", {
  L: { economy: 60000, premium_economy: 88000, business: 137000, first: 210000 },
  R: { economy: 70000, premium_economy: 98000, business: 153000, first: 230000 },
  H: { economy: 98000, premium_economy: 136000, business: 216000, first: 360000 },
});
ao("Europe", "Oceania", {
  L: { economy: 65000, premium_economy: 95000, business: 161000, first: 225000 },
  R: { economy: 75000, premium_economy: 105000, business: 164000, first: 250000 },
  H: { economy: 104000, premium_economy: 144000, business: 250000, first: 390000 },
});

const ANA_PTR = {};
function ap(a, b, economy, business, first) { ANA_PTR[pairKey(a, b)] = { economy, business, first }; }

ap("Japan 1-A", "South Korea",            15000,  30000,  45000);
ap("Japan 1-A", "Asia 1",                 20000,  40000,  60000);
ap("Japan 1-A", "Asia 2",                 35000,  60000,  105000);
ap("Japan 1-A", "Hawaii",                 40000,  85000,  140000);
ap("Japan 1-A", "North America",          50000,  110000, 170000);
ap("Japan 1-A", "Europe",                 55000,  115000, 190000);
ap("Japan 1-A", "Oceania",                45000,  85000,  135000);
ap("Japan 1-B", "South Korea",            18000,  33000,  54000);
ap("Japan 1-B", "Asia 1",                 23000,  43000,  69000);
ap("Japan 1-B", "Asia 2",                 38000,  63000,  114000);
ap("Japan 1-B", "Hawaii",                 43000,  89000,  151000);
ap("Japan 1-B", "North America",          55000,  117000, 187000);
ap("Japan 1-B", "Europe",                 62000,  121000, 207000);
ap("Japan 1-B", "Middle East / Africa",   100000, 185000, 290000);
ap("Japan 1-B", "Central / South America",115000, 195000, 327000);
ap("Japan 1-B", "Oceania",                50000,  91000,  150000);
ap("South Korea", "South Korea",          15000,  30000,  45000);
ap("South Korea", "Asia 1",               22000,  42000,  66000);
ap("South Korea", "Asia 2",               37000,  62000,  111000);
ap("South Korea", "Hawaii",               55000,  111000, 193000);
ap("South Korea", "North America",        60000,  130000, 204000);
ap("South Korea", "Europe",               60000,  118000, 200000);
ap("South Korea", "Middle East / Africa", 97000,  181000, 281000);
ap("South Korea", "Central / South America",122000,207000,347000);
ap("South Korea", "Oceania",              55000,  96000,  180000);
ap("Asia 1", "Asia 1",                    20000,  40000,  60000);
ap("Asia 1", "Asia 2",                    36000,  61000,  108000);
ap("Asia 1", "Hawaii",                    55000,  111000, 193000);
ap("Asia 1", "North America",             60000,  130000, 204000);
ap("Asia 1", "Europe",                    60000,  118000, 200000);
ap("Asia 1", "Middle East / Africa",      96000,  179000, 278000);
ap("Asia 1", "Central / South America",   122000, 207000, 347000);
ap("Asia 1", "Oceania",                   50000,  96000,  180000);
ap("Asia 2", "Asia 2",                    30000,  55000,  90000);
ap("Asia 2", "Hawaii",                    65000,  130000, 242000);
ap("Asia 2", "North America",             80000,  136000, 240000);
ap("Asia 2", "Europe",                    59000,  94000,  177000);
ap("Asia 2", "Middle East / Africa",      72000,  134000, 209000);
ap("Asia 2", "Central / South America",   135000, 228000, 315000);
ap("Asia 2", "Oceania",                   46000,  87000,  166000);
ap("Hawaii", "Hawaii",                    20000,  40000,  60000);
ap("Hawaii", "North America",             47000,  85000,  135000);
ap("Hawaii", "Europe",                    70000,  130000, 210000);
ap("Hawaii", "Middle East / Africa",      90000,  145000, 220000);
ap("Hawaii", "Central / South America",   70000,  130000, 210000);
ap("Hawaii", "Oceania",                   60000,  110000, 201000);
ap("North America", "North America",      30000,  55000,  90000);
ap("North America", "Europe",             55000,  100000, 165000);
ap("North America", "Middle East / Africa",70000, 130000, 210000);
ap("North America", "Central / South America",60000,96000,180000);
ap("North America", "Oceania",            75000,  145000, 246000);
ap("Europe", "Europe",                    30000,  55000,  90000);
ap("Europe", "Middle East / Africa",      60000,  102000, 182000);
ap("Europe", "Central / South America",   70000,  130000, 210000);
ap("Europe", "Oceania",                   80000,  167000, 284000);
ap("Middle East / Africa", "Middle East / Africa", 35000, 60000, 90000);
ap("Middle East / Africa", "Central / South America", 68000, 117000, 203000);
ap("Middle East / Africa", "Oceania",     70000,  133000, 230000);
ap("Central / South America", "Central / South America", 35000, 60000, 90000);
ap("Central / South America", "Oceania",  80000,  167000, 284000);
ap("Oceania", "Oceania",                  30000,  55000,  90000);

const ANA_CARRIERS = new Set(["NH"]);

export const slug = "ana-mileage-club";

export const bookable = BOOKABLE;

export function handle(legs) {
  const originZone = getZone(legs[0].origin_cc, legs[0].origin);
  const destZone = getZone(legs[legs.length - 1].destination_cc, legs[legs.length - 1].destination);
  if (!originZone || !destZone) return [];

  const chart = resolveChart(legs, ANA_CARRIERS);
  const entries = [];

  if (chart !== "partner") {
    const ownFrom = originZone.startsWith("Japan") ? "Japan" : originZone;
    const ownTo = destZone.startsWith("Japan") ? "Japan" : destZone;
    if (ownFrom !== "Middle East / Africa" && ownFrom !== "Central / South America" &&
        ownTo !== "Middle East / Africa" && ownTo !== "Central / South America") {
      const rt = ANA_OWN[pairKey(ownFrom, ownTo)];
      if (rt) {
        for (const [seasonKey, seasonName] of [["L", "low"], ["R", "regular"], ["H", "high"]]) {
          const s = rt[seasonKey];
          entries.push(makeEntry("ana", "own", seasonName,
            s.economy ? s.economy / 2 : null,
            s.premium_economy ? s.premium_economy / 2 : null,
            s.business ? s.business / 2 : null,
            s.first ? s.first / 2 : null,
          ));
        }
      }
    }
  }

  if (chart !== "own") {
    const pFrom = originZone === "Japan" ? "Japan 1-A" : originZone;
    const pTo = destZone === "Japan" ? "Japan 1-A" : destZone;
    const prt = ANA_PTR[pairKey(pFrom, pTo)];
    if (prt) {
      entries.push(makeEntry("ana", "partner", "default",
        prt.economy ? prt.economy / 2 : null,
        null,
        prt.business ? prt.business / 2 : null,
        prt.first ? prt.first / 2 : null,
      ));
    }
  }

  return entries;
}
