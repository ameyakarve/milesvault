// Award-chart data shapes for the `award_quote` tool. Charts are bundled
// data (no KG dependency) — one module per chart, registered in index.ts.

export interface OdRoute {
  e?: number // economy min miles
  p?: number // premium economy
  b?: number // business
  f?: number // first
}

// Direct origin→destination lookup table. The award is priced on the
// itinerary's O&D (first leg's origin → last leg's destination); routing
// in between does not change the price. Keyed `${FROM}-${TO}` (IATA, upper).
export interface OdTableChart {
  method: 'od-table'
  currency: string
  carrier: string // IATA — a "self" chart prices only this carrier's own metal
  routes: Record<string, OdRoute>
}

export type Chart = OdTableChart // union grows as methods are added
