/**
 * JAL Mileage Bank — Own-Metal City-Pair Pricing
 *
 * All values are one-way in JAL miles. Economy, Premium Economy, and Business
 * are flat year-round. First Class has three seasons: Low (L), Regular (R), High (H).
 *
 * Format: "DEST_AIRPORT" → [economy, premEcon, business, firstLow, firstReg, firstHigh]
 * 0 = not available for that cabin/season.
 *
 * All routes are from/to Japan. Pricing is symmetric (same in both directions).
 *
 * Source: https://www.jal.co.jp/jp/en/jalmile/use/jal/inter/routemiles.html
 * Last verified: March 14, 2026
 *
 * HOW TO REFRESH:
 * 1. Open the JAL awards chart page above in a browser
 * 2. Tables 0–7 contain Economy/PremEcon/Business pricing by region
 * 3. Tables 9–16 contain First Class seasonal pricing (L/R/H) by region
 * 4. Update the ROUTES object below with any changed values
 * 5. Deploy with `npx wrangler deploy`
 * 6. Also update the vault file: doubledip/Award Charts/JAL Mileage Bank.md
 */

// Routes keyed by destination airport code(s)
// Some destinations have multiple entries for different departure airports/flights
export const ROUTES = {
  // === Northeast Asia ===
  "PEK": [10000, 0, 24000, 0, 0, 0],           // Beijing
  "SHA": [11000, 16000, 26000, 36000, 43000, 50000], // Shanghai Hongqiao
  "PVG": [10000, 15000, 24000, 36000, 43000, 50000], // Shanghai Pudong (different from Hongqiao — note: Busan 30K flat First not on current page)
  "CAN": [10000, 0, 24000, 0, 0, 0],            // Guangzhou
  "DLC": [10000, 0, 24000, 0, 0, 0],            // Dalian
  "TSN": [10000, 0, 24000, 0, 0, 0],            // Tianjin
  "HKG": [11000, 16000, 26000, 36000, 43000, 50000], // Hong Kong
  "ICN": [7500, 0, 18000, 0, 0, 0],             // Seoul
  "PUS": [7500, 0, 18000, 0, 0, 0], // Busan (Y/J = Seoul; no First — old flat-30K claim unsupported, route absent from the live jal.co.jp chart)

  // Taipei — varies by departure airport
  "TPE_HND": [11000, 0, 26000, 0, 0, 0],        // Taipei from Tokyo Haneda
  "TPE": [9000, 0, 24000, 0, 0, 0],             // Taipei from NRT/KIX/NGO
  "TPE_OKA": [7500, 15000, 0, 0, 0, 0],         // Taipei from Okinawa Naha

  // === Southeast Asia & India ===
  "BKK": [13500, 25000, 40000, 67500, 75000, 82500],     // Bangkok (HND/NRT default)
  "BKK_JL031": [17500, 30000, 45000, 67500, 75000, 82500], // Bangkok JL031/JL034
  "BKK_KIX": [12500, 20000, 37500, 67500, 75000, 82500], // Bangkok from KIX/NGO
  "SIN": [13000, 25000, 40000, 67500, 75000, 82500],     // Singapore
  "KUL": [15000, 25000, 40000, 0, 0, 0],        // Kuala Lumpur
  "CGK": [15000, 25000, 40000, 0, 0, 0],        // Jakarta
  "HAN": [13000, 20000, 30000, 0, 0, 0],        // Hanoi
  "SGN": [13000, 20000, 30000, 0, 0, 0],        // Ho Chi Minh City
  "MNL": [10000, 15000, 24000, 0, 0, 0],        // Manila
  "DEL": [17500, 25000, 40000, 0, 0, 0],        // Delhi
  "BLR": [17500, 25000, 40000, 0, 0, 0],        // Bengaluru

  // === Guam ===
  "GUM": [10000, 0, 23000, 0, 0, 0],            // Guam

  // === Hawaii ===
  "HNL": [20000, 30000, 43000, 90000, 100000, 110000], // Honolulu
  "KOA": [25000, 35000, 45000, 90000, 100000, 110000], // Kona

  // === Oceania ===
  "SYD": [23000, 31000, 45000, 90000, 97500, 105000],  // Sydney
  "MEL": [25000, 35000, 45000, 0, 0, 0],        // Melbourne

  // === Middle East ===
  "DOH": [20000, 30000, 50000, 70000, 80000, 90000],   // Doha

  // === Europe ===
  "LHR": [27000, 40000, 57000, 110000, 125000, 140000], // London
  "CDG": [27000, 40000, 57000, 110000, 125000, 140000], // Paris
  "FRA": [23000, 38000, 55000, 0, 0, 0],        // Frankfurt
  "HEL": [23000, 38000, 55000, 110000, 125000, 140000], // Helsinki

  // === North America ===
  "JFK": [27000, 40000, 55000, 110000, 125000, 140000], // New York
  "BOS": [27000, 40000, 55000, 0, 0, 0],        // Boston
  "ORD": [27000, 40000, 55000, 110000, 125000, 140000], // Chicago
  "DFW": [27000, 40000, 55000, 110000, 125000, 140000], // Dallas
  "SFO": [27000, 40000, 55000, 110000, 125000, 140000], // San Francisco
  "LAX": [27000, 40000, 55000, 110000, 125000, 140000], // Los Angeles
  "SAN": [27000, 40000, 55000, 0, 0, 0],        // San Diego
  "SEA": [27000, 40000, 55000, 110000, 125000, 140000], // Seattle
  "YVR": [27000, 40000, 55000, 110000, 125000, 140000], // Vancouver
};

// Airport aliases — map multiple airport codes to the same pricing
export const ALIASES = {
  "EWR": "JFK", "LGA": "JFK",  // NYC area
  "NRT": null, "HND": null, "KIX": null, "NGO": null, "ITM": null, // Japan (origin, not dest)
  "IAD": "JFK", "DCA": "JFK",  // Washington DC area → same as US East pricing
};
