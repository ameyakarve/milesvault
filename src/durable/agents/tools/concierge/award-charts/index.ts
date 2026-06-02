import { airIndiaSelf } from './air-india-self'
import type { Chart } from './types'

export type { Chart, OdRoute, OdTableChart } from './types'

// Charts keyed by canonical id. `aliases` maps the free-text `program`
// the agent supplies to a chart id, so "air india" / "maharaja club" /
// "flying returns" all resolve to the same chart.
const CHARTS: Record<string, Chart> = {
  'air-india-self': airIndiaSelf,
}

const ALIASES: Record<string, string> = {
  'air-india-self': 'air-india-self',
  'air india': 'air-india-self',
  'air-india': 'air-india-self',
  airindia: 'air-india-self',
  ai: 'air-india-self',
  'maharaja club': 'air-india-self',
  'maharaja-club': 'air-india-self',
  maharaja: 'air-india-self',
  'maharaja club miles': 'air-india-self',
  'flying returns': 'air-india-self',
  'flying-returns': 'air-india-self',
}

// Resolve the agent-supplied `program` string to a bundled chart.
export function resolveChart(program: string): Chart | null {
  const key = program.trim().toLowerCase().replace(/\s+/g, ' ')
  const id = ALIASES[key]
  return id ? CHARTS[id] : null
}
