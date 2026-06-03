/**
 * Finnair Plus — Per-Partner Route Pricing
 *
 * Each partner has its own zone-based chart. Key = "ORIGIN_ZONE-DEST_ZONE"
 * Values = [economy, premEcon/business2, business, first]
 * 0 = not available
 *
 * Source: vault Award Charts/Finnair Plus.md (Mar 2026)
 * HOW TO REFRESH: Update each partner's chart below from finnair.com partner pages
 */

// Alaska Airlines / Hawaiian Airlines
export const AS_CHART = {
  "HI-HI": [10000, 17500, 0, 23500],
  "NAM-MX": [12500, 0, 0, 48500],
  "NAM-NAM": [17500, 25000, 0, 37500],
  "HI-NAM_W": [19500, 26000, 0, 48500],
  "HI-SP": [21000, 27500, 0, 49000],
  "HI-APAC": [27500, 47500, 0, 75000],
  "NAM-JP": [27500, 47500, 0, 75000],
  "HI-NAM_E": [28500, 48500, 0, 76000],
  "HI-NEU": [58500, 92000, 0, 138500],
};

// American Airlines
export const AA_CHART = {
  "NAM-NAM": [16500, 0, 0, 40000],
  "NAM-CB": [15000, 25000, 0, 40000],
  "SAM-SAM": [15000, 25000, 0, 40000],
  "NAM-HI": [15000, 38000, 0, 47500],
  "NAM-CAM": [15000, 38000, 0, 47500],
  "EU-NAM": [23000, 65000, 0, 85000],
  "NAM-SAM": [23000, 55000, 0, 75000],
  "NAM-APAC": [34000, 90000, 0, 118000],
  "EU-CB": [34000, 85000, 0, 115000],
  "EU-HI": [55000, 140000, 0, 190000],
  "EU-CAM": [55000, 140000, 0, 190000],
  "EU-SAM": [55000, 140000, 0, 190000],
};

// Cathay Pacific
export const CX_CHART = {
  "HK-CN": [11000, 18000, 0, 30000],
  "ASIA-ASIA": [22000, 55000, 0, 75000],
  "ASIA-SP": [35000, 75000, 0, 120000],
  "ASIA-NAM": [35000, 75000, 0, 120000],
  "ASIA-SAM": [35000, 75000, 0, 120000],
  "ASIA-EU": [31000, 72500, 0, 110000],
  "ASIA-ZA": [31000, 72500, 0, 110000],
};

// Iberia
export const IB_CHART = {
  "ES-ES": [9200, 15000, 0, 0],
  "ES-IC": [12500, 23000, 0, 0],
  "ES-EU": [14000, 27000, 0, 0],
  "EU-NAM": [27500, 75000, 0, 0],
  "EU-CB": [32500, 87500, 0, 0],
  "EU-SAM": [50000, 125000, 0, 0],
  "EU-ZA": [45000, 125000, 0, 0],
};

// Japan Airlines
export const JL_CHART = {
  "JP-JP": [8500, 14500, 0, 0],
  "JP-KR": [11500, 19000, 0, 34500],
  "JP-CN": [13500, 24500, 0, 45500],
  "JP-SEA": [15500, 41500, 0, 53000],
  "JP-IN": [28500, 78750, 0, 104500],
  "JP-HI": [28500, 78750, 0, 104500],
  "JP-LH": [33500, 94250, 0, 125000], // AUS/NZ/Europe/US
  "EU-APAC": [38500, 108000, 0, 142000],
};

// Malaysia Airlines
export const MH_CHART = {
  "MY-MY": [6000, 15000, 0, 0],
  "MY-SEA_N": [10000, 37500, 0, 0],
  "MY-HK": [15000, 54000, 0, 0],
  "MY-ASIA": [20000, 84000, 0, 0],
  "MY-AUS": [28000, 74500, 0, 0],
  "MY-ME": [28000, 74500, 0, 0],
  "MY-EU": [55000, 126000, 0, 0],
  "MY-NAM": [78000, 156000, 0, 0],
};

// Qatar Airways
export const QR_CHART = {
  "QA-ME_S": [8500, 15000, 0, 26500],    // Bahrain/UAE/Kuwait/Oman
  "QA-ME_L": [11500, 19000, 0, 35500],   // Iran/Iraq/Jordan/Lebanon/Pakistan/Saudi/Yemen
  "QA-IS": [16500, 38500, 0, 48500],     // Africa(ex SA)/Bangladesh/India/Maldives/Nepal/Sri Lanka/Turkey
  "QA-EU": [17000, 41250, 0, 54000],
  "QA-ASIA": [23000, 55000, 0, 75000],   // Rest of Asia/South Africa
  "QA-AUS": [50500, 130000, 0, 170000],  // Australia/North America
  "QA-NAM": [50500, 130000, 0, 170000],
  "QA-NZ": [54000, 140000, 0, 185000],   // New Zealand/South America
  "QA-SAM": [54000, 140000, 0, 185000],
};

// Qantas
export const QF_CHART = {
  "AUS-AUS": [13000, 22500, 0, 42000],   // Includes NZ
  "AUS-TAH": [15000, 35000, 0, 50500],
  "AUS-ASIA": [28000, 65000, 0, 90000],
  "AUS-AF": [40000, 95000, 0, 150000],
  "AUS-EU": [47500, 130000, 0, 180000],
  "AUS-SAM": [40000, 125000, 0, 175000],
  "AUS-NAM": [40000, 95000, 0, 150000],
};

// SriLankan Airlines
export const UL_CHART = {
  "LK-IN": [10000, 18000, 0, 0],         // India (ex Delhi) / Maldives
  "LK-SEA": [14000, 24000, 0, 0],        // Delhi/Indonesia/Malaysia/Singapore/Thailand
  "LK-ME": [15000, 41000, 0, 0],         // Middle East incl Pakistan
  "LK-EU": [23000, 64000, 0, 0],         // Europe/China/Japan
};
