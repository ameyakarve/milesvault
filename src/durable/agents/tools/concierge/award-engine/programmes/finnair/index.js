/**
 * Finnair Plus (Avios) — Per-partner zone-based charts
 *
 * - Finnair own-metal: zone-based from Helsinki, no peak/off-peak
 * - Each oneworld partner: unique zone-based chart
 * - BA: uses BA's own distance-based pricing (handled by BA module, not here)
 *
 * Source: vault Award Charts/Finnair Plus.md
 * HOW TO REFRESH: Update routes.js with new per-partner charts
 */

import { AS_CHART, AA_CHART, CX_CHART, IB_CHART, JL_CHART, MH_CHART, QR_CHART, QF_CHART, UL_CHART } from "./routes.js";

// JJ added: finnair.com lists LATAM Brazil as a separate redemption partner from LATAM Chile (LA)
const BOOKABLE = new Set(["AA","AS","AT","AY","BA","CX","FJ","HA","IB","JJ","JL","LA","MH","QF","QR","RJ","UL","WY"]);

const AY_CARRIERS = new Set(["AY"]);

// Finnair own-metal zones
const AY_ZONE = {
  FI: "FI_NE", SE: "FI_NE", NO: "FI_NE", DK: "FI_NE", EE: "FI_NE", LV: "FI_NE", LT: "FI_NE",
  DE: "CE", PL: "CE", CZ: "CE", AT: "CE", CH: "CE", HU: "CE", SK: "CE",
  GB: "WSE", FR: "WSE", ES: "WSE", PT: "WSE", IT: "WSE", GR: "WSE", NL: "WSE", BE: "WSE", IE: "WSE",
  HR: "WSE", BG: "WSE", RO: "WSE", RS: "WSE", SI: "WSE",
  IL: "CAN", TR: "CAN",
  QA: "ME_IN", AE: "ME_IN", IN: "ME_IN", LK: "ME_IN",
  JP: "ASIA_LH", SG: "ASIA_LH", KR: "ASIA_LH", CN: "ASIA_LH", HK: "ASIA_LH", TH: "ASIA_LH",
  US: "ASIA_LH", CA: "ASIA_LH", MY: "ASIA_LH", VN: "ASIA_LH", ID: "ASIA_LH", PH: "ASIA_LH",
  AU: "ASIA_LH", NZ: "ASIA_LH",
};

const AY_CHART = {
  FI_NE: [6500, 0, 10000],
  CE: [12000, 0, 18000],
  WSE: [13000, 0, 20000],
  CAN: [15000, 0, 25000],
  ME_IN: [28000, 42000, 55000],
  ASIA_LH: [30000, 43500, 62500],
};

// Partner zone resolvers — map country codes to each partner's zone system
function getPartnerZonePair(carrier, originCC, destCC) {
  const AS_CARRIERS = new Set(["AS","HA"]);
  if (AS_CARRIERS.has(carrier)) return resolveAS(originCC, destCC);
  if (carrier === "AA") return resolveAA(originCC, destCC);
  if (carrier === "CX") return resolveCX(originCC, destCC);
  if (carrier === "IB") return resolveIB(originCC, destCC);
  if (carrier === "JL") return resolveJL(originCC, destCC);
  if (carrier === "MH") return resolveMH(originCC, destCC);
  if (carrier === "QR") return resolveQR(originCC, destCC);
  if (carrier === "QF") return resolveQF(originCC, destCC);
  if (carrier === "UL") return resolveUL(originCC, destCC);
  return null;
}

function resolveAA(o, d) {
  const NAM = new Set(["US","CA","MX"]);
  const EU = new Set(["GB","FR","DE","NL","BE","CH","AT","IE","DK","SE","NO","FI","IT","ES","PT","GR","PL","CZ","HU"]);
  const CB = new Set(["CU","DO","JM","BS","BB","TT","PR"]);
  const SAM = new Set(["BR","AR","CL","CO","PE","EC"]);
  const CAM = new Set(["GT","HN","SV","NI","CR","PA","BZ"]);
  const APAC = new Set(["JP","KR","CN","HK","TW","TH","SG","MY","ID","PH","VN","AU","NZ","IN"]);
  const HI = new Set(["HI"]); // handled by airport

  const z = (cc) => {
    if (NAM.has(cc)) return "NAM";
    if (EU.has(cc)) return "EU";
    if (CB.has(cc)) return "CB";
    if (SAM.has(cc)) return "SAM";
    if (CAM.has(cc)) return "CAM";
    if (APAC.has(cc)) return "APAC";
    return null;
  };
  const zo = z(o), zd = z(d);
  if (!zo || !zd) return null;
  // Try both directions
  return AA_CHART[`${zo}-${zd}`] || AA_CHART[`${zd}-${zo}`] || null;
}

function resolveCX(o, d) {
  const HK = new Set(["HK"]);
  const CN = new Set(["CN","TW","PH"]);
  const ASIA = new Set(["JP","KR","TH","SG","MY","ID","VN","IN","LK","MV","AE","SA","QA","BH","KW","OM"]);
  const EU = new Set(["GB","FR","DE","NL","IT","ES","CH","AT","SE","ZA"]);
  const SP = new Set(["AU","NZ","FJ"]);
  const NAM = new Set(["US","CA"]);
  const SAM = new Set(["BR","AR","CL"]);

  if ((HK.has(o) && CN.has(d)) || (CN.has(o) && HK.has(d))) return CX_CHART["HK-CN"];
  const isAsia = (cc) => HK.has(cc) || CN.has(cc) || ASIA.has(cc);
  if (isAsia(o) && isAsia(d)) return CX_CHART["ASIA-ASIA"];
  if (isAsia(o) && EU.has(d) || EU.has(o) && isAsia(d)) return CX_CHART["ASIA-EU"];
  if (isAsia(o) && (SP.has(d) || NAM.has(d) || SAM.has(d))) return CX_CHART["ASIA-SP"];
  if ((SP.has(o) || NAM.has(o) || SAM.has(o)) && isAsia(d)) return CX_CHART["ASIA-SP"];
  return null;
}

function resolveIB(o, d) {
  const ES = new Set(["ES"]);
  const EU = new Set(["GB","FR","DE","NL","BE","CH","AT","IE","IT","PT","GR","PL","SE","NO","DK","FI"]);
  const NAM = new Set(["US","CA","MX"]);
  const CB = new Set(["CU","DO","JM","CR","PA"]);
  const SAM = new Set(["BR","AR","CL","CO","PE","EC"]);
  const ZA = new Set(["ZA"]);

  if (ES.has(o) && ES.has(d)) return IB_CHART["ES-ES"];
  if ((ES.has(o) && EU.has(d)) || (EU.has(o) && ES.has(d))) return IB_CHART["ES-EU"];
  const isEU = (cc) => ES.has(cc) || EU.has(cc);
  if (isEU(o) && NAM.has(d) || NAM.has(o) && isEU(d)) return IB_CHART["EU-NAM"];
  if (isEU(o) && CB.has(d) || CB.has(o) && isEU(d)) return IB_CHART["EU-CB"];
  if (isEU(o) && SAM.has(d) || SAM.has(o) && isEU(d)) return IB_CHART["EU-SAM"];
  if (isEU(o) && ZA.has(d) || ZA.has(o) && isEU(d)) return IB_CHART["EU-ZA"];
  return null;
}

function resolveJL(o, d) {
  const JP = new Set(["JP"]);
  const KR = new Set(["KR"]);
  const CN = new Set(["CN","HK","TW","GU"]);
  const SEA = new Set(["TH","SG","MY","ID","VN","PH","KH","MM"]);
  const IN = new Set(["IN","LK","BD"]);
  const HI_CC = new Set(["US"]); // Hawaii handled separately
  const LH = new Set(["AU","NZ","GB","FR","DE","US","CA"]); // long-haul
  const EU = new Set(["GB","FR","DE","NL","IT","ES","FI","SE","NO"]);

  if (JP.has(o) && JP.has(d)) return JL_CHART["JP-JP"];
  if ((JP.has(o) && KR.has(d)) || (KR.has(o) && JP.has(d))) return JL_CHART["JP-KR"];
  if ((JP.has(o) && CN.has(d)) || (CN.has(o) && JP.has(d))) return JL_CHART["JP-CN"];
  if ((JP.has(o) && SEA.has(d)) || (SEA.has(o) && JP.has(d))) return JL_CHART["JP-SEA"];
  if ((JP.has(o) && IN.has(d)) || (IN.has(o) && JP.has(d))) return JL_CHART["JP-IN"];
  if ((JP.has(o) && LH.has(d)) || (LH.has(o) && JP.has(d))) return JL_CHART["JP-LH"];
  if ((EU.has(o) && !JP.has(d)) || (!JP.has(o) && EU.has(d))) return JL_CHART["EU-APAC"];
  return null;
}

function resolveMH(o, d) {
  const MY = new Set(["MY","SG"]);
  const SEA_N = new Set(["TH","VN","KH","MM","ID"]);
  const HK = new Set(["HK","PH"]);
  const ASIA = new Set(["JP","KR","CN","TW","IN","LK","BD"]);
  const AUS = new Set(["AU","NZ","AE","SA","QA","BH","KW","OM"]);
  const EU = new Set(["GB","FR","DE","NL","IT","ES","SE","FI"]);
  const NAM = new Set(["US","CA"]);

  if (MY.has(o) && MY.has(d)) return MH_CHART["MY-MY"];
  const isMY = (cc) => MY.has(cc);
  if (isMY(o) && SEA_N.has(d) || SEA_N.has(o) && isMY(d)) return MH_CHART["MY-SEA_N"];
  if (isMY(o) && HK.has(d) || HK.has(o) && isMY(d)) return MH_CHART["MY-HK"];
  if (isMY(o) && ASIA.has(d) || ASIA.has(o) && isMY(d)) return MH_CHART["MY-ASIA"];
  if (isMY(o) && AUS.has(d) || AUS.has(o) && isMY(d)) return MH_CHART["MY-AUS"];
  if (isMY(o) && EU.has(d) || EU.has(o) && isMY(d)) return MH_CHART["MY-EU"];
  if (isMY(o) && NAM.has(d) || NAM.has(o) && isMY(d)) return MH_CHART["MY-NAM"];
  return null;
}

function resolveQR(o, d) {
  const QA = new Set(["QA"]);
  const ME_S = new Set(["BH","AE","KW","OM"]);
  const ME_L = new Set(["IR","IQ","JO","LB","PK","SA","YE"]);
  const IS = new Set(["IN","BD","MV","NP","LK","TR","ZA","KE","TZ","ET"]);
  const EU = new Set(["GB","FR","DE","NL","IT","ES","SE","FI","NO","DK","CH","AT","GR","PL"]);
  const ASIA = new Set(["JP","KR","CN","HK","TW","TH","SG","MY","ID","PH","VN"]);
  const AUS = new Set(["AU","US","CA"]);
  const NZ = new Set(["NZ","BR","AR","CL"]);

  if (!QA.has(o) && !QA.has(d)) return null; // Only from/to Qatar
  const far = QA.has(o) ? d : o;
  if (ME_S.has(far)) return QR_CHART["QA-ME_S"];
  if (ME_L.has(far)) return QR_CHART["QA-ME_L"];
  if (IS.has(far)) return QR_CHART["QA-IS"];
  if (EU.has(far)) return QR_CHART["QA-EU"];
  if (ASIA.has(far)) return QR_CHART["QA-ASIA"];
  if (AUS.has(far)) return QR_CHART["QA-AUS"];
  if (NZ.has(far)) return QR_CHART["QA-NZ"];
  return null;
}

function resolveQF(o, d) {
  const AUS = new Set(["AU","NZ"]);
  const ASIA = new Set(["JP","KR","CN","HK","TW","TH","SG","MY","ID","PH","VN","IN"]);
  const EU = new Set(["GB","FR","DE","NL","IT","ES","SE","FI","NO"]);
  const AF = new Set(["ZA","KE"]);
  const NAM = new Set(["US","CA"]);
  const SAM = new Set(["BR","AR","CL"]);

  if (AUS.has(o) && AUS.has(d)) return QF_CHART["AUS-AUS"];
  const isAUS = (cc) => AUS.has(cc);
  if (isAUS(o) && ASIA.has(d) || ASIA.has(o) && isAUS(d)) return QF_CHART["AUS-ASIA"];
  if (isAUS(o) && EU.has(d) || EU.has(o) && isAUS(d)) return QF_CHART["AUS-EU"];
  if (isAUS(o) && AF.has(d) || AF.has(o) && isAUS(d)) return QF_CHART["AUS-AF"];
  if (isAUS(o) && NAM.has(d) || NAM.has(o) && isAUS(d)) return QF_CHART["AUS-NAM"];
  if (isAUS(o) && SAM.has(d) || SAM.has(o) && isAUS(d)) return QF_CHART["AUS-SAM"];
  return null;
}

function resolveUL(o, d) {
  const LK = new Set(["LK"]);
  const IN = new Set(["IN","MV"]); // ex Delhi uses SEA rate
  const SEA = new Set(["TH","MY","SG","ID"]); // + Delhi
  const ME = new Set(["AE","SA","QA","PK","OM","BH","KW"]);
  const EU = new Set(["GB","FR","DE","CN","JP"]);

  if (!LK.has(o) && !LK.has(d)) return null;
  const far = LK.has(o) ? d : o;
  if (IN.has(far)) return UL_CHART["LK-IN"];
  if (SEA.has(far)) return UL_CHART["LK-SEA"];
  if (ME.has(far)) return UL_CHART["LK-ME"];
  if (EU.has(far)) return UL_CHART["LK-EU"];
  return null;
}

function resolveAS(o, d) {
  // Simplified — return NAM-NAM as default for AS/HA
  const NAM = new Set(["US","CA","MX"]);
  if (NAM.has(o) && NAM.has(d)) return AS_CHART["NAM-NAM"];
  return null; // Complex Hawaii/international routing — return null for [0,0]
}

export const slug = "finnair-plus";

export const bookable = BOOKABLE;

export function handle(legs) {
  const carriers = legs.map((l) => l.carrier).filter(Boolean);
  const originCC = legs[0].origin_cc;
  const destCC = legs[legs.length - 1].destination_cc;

  // Finnair own-metal
  if (carriers.length > 0 && carriers.every((c) => AY_CARRIERS.has(c))) {
    const foreignCC = originCC === "FI" ? destCC : (destCC === "FI" ? originCC : destCC);
    const zone = AY_ZONE[foreignCC];
    if (zone) {
      const [e, pe, b] = AY_CHART[zone];
      const wrap = (v) => v === 0 ? null : [v, v];
      return [{
        programme: "finnair", chart: "own", season: "default",
        economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: null,
      }];
    }
    return [];
  }

  // Partner — resolve per-carrier chart
  const carrier = carriers.length > 0 ? carriers[0] : null;
  if (!carrier) return []; // No carrier specified — can't determine which partner chart

  // BA uses its own module — skip here
  if (carrier === "BA") return [];

  const chart = getPartnerZonePair(carrier, originCC, destCC);
  if (!chart) return []; // Unknown zone pair for this partner

  const [e, b2, _b, f] = chart;
  // b2 is business for most; for AS it's premium
  const wrap = (v) => v === 0 ? null : [v, v];

  return [{
    programme: "finnair", chart: `partner_${carrier.toLowerCase()}`, season: "default",
    economy: wrap(e),
    premium_economy: null,
    business: wrap(b2),
    first: wrap(f),
  }];
}
