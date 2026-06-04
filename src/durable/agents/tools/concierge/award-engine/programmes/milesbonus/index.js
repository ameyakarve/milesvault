/**
 * Miles+Bonus (Aegean Airlines) — No published award chart
 *
 * A3 own-metal and OA (Olympic Air): no static award chart in vault.
 * Star Alliance partner: no static award chart in vault.
 *
 * Miles+Bonus uses a dynamic/calculator-based system. No published zone matrix
 * or distance-based chart is available. Returns empty results.
 *
 * Source: no vault Award Chart file exists
 * HOW TO REFRESH: If a static chart is published, add zone maps and chart data
 */

// Star Alliance (27 — includes OA as A3 regional partner)
const BOOKABLE = new Set(["A3","AC","AI","AV","BR","CA","CM","ET","LH","LO","LX","MS","NH","NZ","OA","OS","OU","OZ","SA","SN","SQ","TG","TK","TP","UA","VL","ZH"]);

export const slug = "miles-and-bonus";

export const bookable = BOOKABLE;

export function handle(legs) {
  // No published award chart — cannot compute pricing
  return [];
}
