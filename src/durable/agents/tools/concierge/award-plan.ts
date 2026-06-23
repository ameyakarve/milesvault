import type { AwardOptionsResult } from './award-options'

// Row shape for the award EXPLORER table. (This module was once the card-scoped
// award-plan pipeline — `buildAwardPlan`, which JOINed computeAwardOptions
// against the transfers graph from a card's currency. That costed/sourced plan
// was retired with the Award Explorer cleanup; the explorer now shows each
// programme's own published miles, and accumulation/transfers live on /points.
// Only the row TYPE survives, consumed by award-explore.ts + the explore UI.)

type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'

// A cabin cell: published [min,max] points, the string "dynamic" (bookable, no
// published rate), or null (cabin not offered).
type CabinCell = [number, number] | 'dynamic' | null

export type AwardPlanRow = {
  programme: string
  programme_currency: string | null
  own_metal: boolean
  stops: number
  routings: AwardOptionsResult['options'][number]['routings']
  total_distance: number
  published: boolean
  // Per-cabin award price in the PROGRAMME's own miles (the chart figure).
  miles: Record<Cabin, CabinCell>
  // Transfer/cost fields — blanked by the explorer (no card costing here).
  reachable: boolean
  multiplier: number | null
  hops: number | null
  path: string[]
  cost: Record<Cabin, CabinCell>
}
