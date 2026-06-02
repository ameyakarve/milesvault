// Award-chart data shapes for the `award_quote` tool. Charts are bundled
// data (no KG dependency) — one module per chart, registered in index.ts.

export interface OdRoute {
  e?: number // economy min miles
  p?: number // premium economy
  b?: number // business
  f?: number // first
}

// Direct origin→destination lookup table. Each leg is priced as its own
// one-way O&D at that leg's cabin and the legs are summed (additive). The
// caller lists every leg; round trips / connections are just more legs.
// Keyed `${FROM}-${TO}` (IATA, upper).
export interface OdTableChart {
  method: 'od-table'
  currency: string
  carrier: string // IATA — a "self" chart prices only this carrier's own metal
  routes: Record<string, OdRoute>
}

export type Chart = OdTableChart // union grows as methods are added
