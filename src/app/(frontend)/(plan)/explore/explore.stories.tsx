import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useMemo, useState } from 'react'
import {
  Explore,
  type AirlineMode,
  type Cabin,
  type ExploreStatus,
  type SortKey,
  type Stops,
} from './explore-ui'
import type { ExploreAirline, ExploreRow } from '@/durable/agents/tools/concierge/award-explore'
import type { TransferSource } from '@/durable/agents/tools/concierge/transfer-sources'

const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']
type MilesByCabin = Partial<Record<Cabin, [number, number]>>

function mk(
  programme: string,
  stops: number,
  hub: string | null,
  carriers: string[],
  milesBy: MilesByCabin,
  mult: number | null,
  path: string[],
  ownMetal = false,
): ExploreRow {
  const miles = {} as ExploreRow['miles']
  const cost = {} as ExploreRow['cost']
  for (const c of CABINS) {
    const m = milesBy[c] ?? null
    miles[c] = m
    cost[c] = mult != null && m ? [Math.round(m[0] * mult), Math.round(m[1] * mult)] : null
  }
  return {
    programme,
    programme_currency: `currency/${programme}`,
    own_metal: ownMetal,
    stops,
    routings: [{ hub, carriers, distance: 4164 }],
    total_distance: 4164,
    published: true,
    miles,
    reachable: mult != null,
    multiplier: mult,
    hops: mult != null ? Math.max(0, path.length - 1) : null,
    path,
    cost,
  }
}

const ROWS: ExploreRow[] = [
  mk(
    'jal-mileage-bank',
    0,
    null,
    ['JL'],
    { economy: [17500, 17500], premium_economy: [25000, 25000], business: [40000, 40000] },
    1.25,
    ['currency/edge-rewards-burgundy', 'currency/jal-mileage-bank-miles'],
    true,
  ),
  mk(
    'enrich',
    0,
    null,
    ['JL'],
    { economy: [20000, 20000], business: [35000, 35000], first: [45000, 45000] },
    2.0,
    [
      'currency/edge-rewards-burgundy',
      'currency/itc-green-points',
      'currency/marriott-bonvoy-points',
      'currency/enrich-miles',
    ],
  ),
  mk(
    'aadvantage',
    0,
    null,
    ['JL'],
    {
      economy: [22500, 22500],
      premium_economy: [32500, 32500],
      business: [40000, 40000],
      first: [50000, 50000],
    },
    2.5,
    [
      'currency/edge-rewards-burgundy',
      'currency/itc-green-points',
      'currency/marriott-bonvoy-points',
      'currency/aadvantage-miles',
    ],
  ),
  mk(
    'qantas-frequent-flyer',
    0,
    null,
    ['JL'],
    {
      economy: [34700, 34700],
      premium_economy: [70800, 70800],
      business: [90000, 90000],
      first: [129200, 129200],
    },
    1.25,
    ['currency/edge-rewards-burgundy', 'currency/qantas-points'],
  ),
  mk(
    'asia-miles',
    1,
    'HKG',
    ['CX', 'CX'],
    { economy: [27000, 27000], business: [63000, 63000], first: [100000, 100000] },
    2.0,
    [
      'currency/edge-rewards-burgundy',
      'currency/itc-green-points',
      'currency/marriott-bonvoy-points',
      'currency/asia-miles',
    ],
  ),
  mk(
    'krisflyer',
    1,
    'SIN',
    ['SQ', 'SQ'],
    { economy: [45500, 45500], business: [91000, 91000], first: [117000, 117000] },
    1.25,
    ['currency/edge-rewards-burgundy', 'currency/krisflyer-miles'],
  ),
  // A dynamic / phone-only programme: the chart returns 0 → "varies", never 0.
  {
    programme: 'latam-pass',
    programme_currency: 'currency/latam-pass-miles',
    own_metal: false,
    stops: 0,
    routings: [{ hub: null, carriers: ['JL'], distance: 4164 }],
    total_distance: 4164,
    published: true,
    miles: { economy: 'dynamic', premium_economy: null, business: 'dynamic', first: null },
    reachable: true,
    multiplier: 2.5,
    hops: 1,
    path: ['currency/edge-rewards-burgundy', 'currency/latam-pass-miles'],
    cost: { economy: 'dynamic', premium_economy: null, business: 'dynamic', first: null },
  },
]

const AIRLINES: ExploreAirline[] = [
  { iata: 'JL', name: 'Japan Airlines' },
  { iata: 'CX', name: 'Cathay Pacific' },
  { iata: 'NH', name: 'ANA' },
  { iata: 'SQ', name: 'Singapore Airlines' },
  { iata: 'QF', name: 'Qantas' },
]

// Stands in for the KG-derived "Transfer from" list (cards + transferable
// currencies; the real one is a few hundred items, computed on demand).
const SOURCES: TransferSource[] = [
  { slug: 'cc/axis-magnus', name: 'Axis Bank Magnus', kind: 'card' },
  { slug: 'cc/axis-reserve', name: 'Axis Bank Reserve', kind: 'card' },
  { slug: 'cc/hdfc-infinia-metal', name: 'HDFC Infinia (Metal)', kind: 'card' },
  { slug: 'cc/icici-emeralde', name: 'ICICI Emeralde', kind: 'card' },
  { slug: 'cc/sbi-aurum', name: 'SBI Aurum', kind: 'card' },
  { slug: 'currency/amex-membership-rewards-points', name: 'Amex Membership Rewards India', kind: 'currency' },
  { slug: 'currency/bilt-points', name: 'Bilt Rewards Points', kind: 'currency' },
  { slug: 'currency/edge-rewards-burgundy', name: 'EDGE Rewards — Burgundy tier', kind: 'currency' },
  { slug: 'currency/marriott-bonvoy-points', name: 'Marriott Bonvoy Points', kind: 'currency' },
]

// Stands in for the KG-derived `names` map the endpoint returns (slug →
// display_name). The real page gets this from the graph, never hardcoded.
const NAMES: Record<string, string> = {
  'jal-mileage-bank': 'JAL Mileage Bank',
  enrich: 'Enrich',
  aadvantage: 'AAdvantage',
  'qantas-frequent-flyer': 'Qantas Frequent Flyer',
  'asia-miles': 'Asia Miles',
  krisflyer: 'KrisFlyer',
  'currency/edge-rewards-burgundy': 'EDGE Rewards — Burgundy tier',
  'currency/jal-mileage-bank-miles': 'JAL Mileage Bank miles',
  'currency/qantas-points': 'Qantas Points',
  'currency/itc-green-points': 'ITC Green Points',
  'currency/marriott-bonvoy-points': 'Marriott Bonvoy Points',
  'currency/enrich-miles': 'Enrich Miles',
  'currency/aadvantage-miles': 'AAdvantage miles',
  'currency/asia-miles': 'Asia Miles',
  'currency/krisflyer-miles': 'KrisFlyer miles',
  'latam-pass': 'LATAM Pass',
  'currency/latam-pass-miles': 'LATAM Pass miles',
}

const AIRPORTS: Record<string, [number, number]> = {
  BLR: [13.1986, 77.7066],
  NRT: [35.7647, 140.3863],
  SIN: [1.3592, 103.9894],
  HKG: [22.308, 113.918],
}

function primaryValue(row: ExploreRow, cabin: Cabin): number {
  const c = row.cost[cabin]
  if (Array.isArray(c)) return c[0]
  const m = row.miles[cabin]
  if (Array.isArray(m)) return m[0]
  return Number.POSITIVE_INFINITY
}

function Harness({ status = 'ready' as ExploreStatus }: { status?: ExploreStatus }) {
  const [origin, setOrigin] = useState('BLR')
  const [destination, setDestination] = useState('NRT')
  const [cabin, setCabin] = useState<Cabin>('business')
  const [source, setSource] = useState('currency/edge-rewards-burgundy')
  const [stops, setStops] = useState<Stops>('all')
  const [sort, setSort] = useState<SortKey>('cost')
  const [airlineMode, setAirlineMode] = useState<AirlineMode>('include')
  const [selectedAirlines, setSelectedAirlines] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set([`${ROWS[3].programme}|0|3`]))

  const rows = useMemo(() => {
    let r = ROWS.filter((x) => x.miles[cabin] != null)
    if (stops !== 'all') r = r.filter((x) => String(x.stops) === stops)
    if (selectedAirlines.size)
      r = r.filter((x) => {
        const hit = (x.routings[0]?.carriers ?? []).some((c) => selectedAirlines.has(c))
        return airlineMode === 'include' ? hit : !hit
      })
    return [...r].sort((a, b) => {
      if (sort === 'stops') return a.stops - b.stops
      if (sort === 'distance') return a.total_distance - b.total_distance
      return primaryValue(a, cabin) - primaryValue(b, cabin)
    })
  }, [cabin, stops, selectedAirlines, airlineMode, sort])

  return (
    <div className="h-screen">
      <Explore
        origin={origin}
        destination={destination}
        onOrigin={setOrigin}
        onDestination={setDestination}
        cabin={cabin}
        onCabin={setCabin}
        source={source}
        onSource={setSource}
        sources={SOURCES}
        airlines={AIRLINES}
        airlineMode={airlineMode}
        onAirlineMode={setAirlineMode}
        selectedAirlines={selectedAirlines}
        onToggleAirline={(iata) =>
          setSelectedAirlines((prev) => {
            const next = new Set(prev)
            if (next.has(iata)) next.delete(iata)
            else next.add(iata)
            return next
          })
        }
        stops={stops}
        onStops={setStops}
        sort={sort}
        onSort={setSort}
        status={status === 'ready' ? 'ready' : status}
        rows={status === 'ready' ? rows : []}
        names={NAMES}
        airports={AIRPORTS}
        resultOrigin={origin}
        resultDestination={destination}
        onReset={() => {
          setSource('')
          setStops('all')
          setSelectedAirlines(new Set())
          setAirlineMode('include')
        }}
        expanded={expanded}
        onToggleExpanded={(k) =>
          setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(k)) next.delete(k)
            else next.add(k)
            return next
          })
        }
      />
    </div>
  )
}

const meta: Meta<typeof Harness> = {
  title: 'Explore/AwardExplorer',
  component: Harness,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof Harness>

export const Loaded: Story = { args: { status: 'ready' } }
export const Loading: Story = { args: { status: 'loading' } }
