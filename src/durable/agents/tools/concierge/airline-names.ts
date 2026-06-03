// Airline display-name → IATA, scoped to the carriers our award charts can
// price (the union of every programme's `bookable` set in the award engine).
//
// Why this exists: AeroDataBox `routes/daily` usually returns an operator's
// IATA code, but for sparse / newly-launched routes it sometimes returns the
// airline NAME with no `iata` (and no `icao`) — e.g. the BLR→NRT nonstop came
// back as `{ "name": "Japan Airlines" }`. Without a code the graph-walker
// can't recognise the carrier or quote it, so the cheapest routing silently
// disappears. This map lets `routes-store` recover the code from the name.
//
// Two naming styles are folded in, because the SAME airline is named
// differently depending on the data path:
//   - hub style (what `routes/daily` returns when the code IS present), e.g.
//     "JAL", "ANA", "KLM" — harvested from 17 major-hub route lists.
//   - sparse style (what the code-less rows tend to use), the fuller legal
//     name, e.g. "Japan Airlines", "All Nippon Airways" — added by hand for
//     the known divergent cases.
// Anything not in our charts is intentionally absent: we couldn't price it
// regardless, so leaving its `iata` null is correct.
//
// To regenerate the harvested block: re-run the hub sweep over `routes/daily`
// (IST DXB LHR FRA CDG SIN HKG BKK DOH JFK LAX DEL SYD GRU JNB ADD AUH),
// intersect operators against the engine's bookable union, key by normalized
// name. Then re-apply the curated aliases + residue below.

// Normalize for lookup: lowercase, collapse internal whitespace, trim.
export function normalizeAirlineName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

// normalized name → IATA. Keys are already normalized.
const AIRLINE_NAME_TO_IATA: Record<string, string> = {
  // ---- harvested from AeroDataBox hub data (99 chart carriers) ----
  'aegean airlines': 'A3',
  'aer lingus': 'EI',
  'aerolineas argentinas': 'AR',
  aeromexico: 'AM',
  'air canada': 'AC',
  'air china': 'CA',
  'air dolomiti': 'EN',
  'air europa': 'UX',
  'air france': 'AF',
  'air india': 'AI',
  'air macau': 'NX',
  'air mauritius': 'MK',
  'air new zealand': 'NZ',
  'air serbia': 'JU',
  'air tahiti nui': 'TN',
  airbaltic: 'BT',
  'alaska airlines': 'AS',
  'american airlines': 'AA',
  ana: 'NH',
  'asiana airlines': 'OZ',
  austrian: 'OS',
  avianca: 'AV',
  azul: 'AD',
  'bangkok airways': 'PG',
  'british airways': 'BA',
  'brussels airlines': 'SN',
  'cape air': '9K',
  'cathay pacific': 'CX',
  'china airlines': 'CI',
  'china eastern airlines': 'MU',
  'china southern airlines': 'CZ',
  condor: 'DE',
  'copa airlines': 'CM',
  'croatia airlines': 'OU',
  'delta air lines': 'DL',
  easyjet: 'U2',
  egyptair: 'MS',
  'el al': 'LY',
  emirates: 'EK',
  'ethiopian airlines': 'ET',
  'etihad airways': 'EY',
  eurowings: 'EW',
  'eurowings discover': '4Y',
  'eva air': 'BR',
  'fiji airways': 'FJ',
  finnair: 'AY',
  flydubai: 'FZ',
  'garuda indonesia': 'GA',
  gol: 'G3',
  'gulf air': 'GF',
  'hainan airlines': 'HU',
  'hong kong airlines': 'HX',
  'hong kong express': 'UO',
  iberia: 'IB',
  icelandair: 'FI',
  indigo: '6E',
  'ita airways': 'AZ',
  jal: 'JL',
  jet2: 'LS',
  'jetblue airways': 'B6',
  jetstar: 'JQ',
  'juneyao airlines': 'HO',
  'kenya airways': 'KQ',
  klm: 'KL',
  'korean air': 'KE',
  latam: 'LA',
  'lot - polish airlines': 'LO',
  lufthansa: 'LH',
  'lufthansa city airlines': 'VL',
  'malaysia airlines': 'MH',
  'middle east airlines': 'ME',
  'oman air': 'WY',
  'philippine airlines': 'PR',
  'porter airlines': 'PD',
  qantas: 'QF',
  'qatar airways': 'QR',
  'royal air maroc': 'AT',
  'royal jordanian': 'RJ',
  sas: 'SK',
  'saudi arabian airlines': 'SV',
  scoot: 'TR',
  'shenzhen airlines': 'ZH',
  'singapore airlines': 'SQ',
  'south african airways': 'SA',
  spicejet: 'SG',
  'srilankan airlines': 'UL',
  'starlux airlines': 'JX',
  'sun express': 'XQ',
  swiss: 'LX',
  'tap air portugal': 'TP',
  tarom: 'RO',
  'thai airways international': 'TG',
  'turkish airlines': 'TK',
  'united airlines': 'UA',
  'vietnam airlines': 'VN',
  'virgin atlantic': 'VS',
  'virgin australia': 'VA',
  westjet: 'WS',
  'xiamen airlines': 'MF',

  // ---- residue: chart carriers not seen at the sampled hubs ----
  'silver airways': '3M',
  'hawaiian airlines': 'HA',
  'olympic air': 'OA',

  // ---- sparse-row name aliases (fuller legal names that code-less rows
  //      use instead of the hub abbreviation) ----
  'japan airlines': 'JL',
  'all nippon airways': 'NH',
  'klm royal dutch airlines': 'KL',
  'scandinavian airlines': 'SK',
  'swiss international air lines': 'LX',
  'latam airlines': 'LA',
  'olympic airlines': 'OA',
}

// Resolve an airline display name to a chart-carrier IATA, or null if the
// name isn't one of our priceable carriers.
export function lookupAirlineIata(name: string): string | null {
  return AIRLINE_NAME_TO_IATA[normalizeAirlineName(name)] ?? null
}
