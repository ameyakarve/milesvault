import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { Points, type PointsStatus, type FilterMode, type PointsFilters } from './points-ui'
import type { PointsPathsResult } from '@/durable/agents/tools/concierge/points-paths'
import type { LoyaltyCurrency } from '@/durable/agents/tools/concierge/loyalty-currencies'

// Synthetic programme-keyed fixture (new account model): a target programme,
// one feeder programme that transfers in, a card that earns the feeder, and a
// cash buy-in. Illustrative ratios only.
const FIXTURE: PointsPathsResult = {
  target: { slug: 'program/qantas-frequent-flyer', display: 'Qantas Frequent Flyer', beancountName: null },
  amount: 90000,
  nodes: [
    { id: 'program/qantas-frequent-flyer', kind: 'target', display: 'Qantas Frequent Flyer', tickers: ['QANTAS'], multiplier: 1, hops: 0 },
    {
      id: 'program/marriott-bonvoy',
      kind: 'program',
      display: 'Marriott Bonvoy',
      tickers: ['BONVOY'],
      multiplier: 3,
      hops: 1,
      path: ['program/marriott-bonvoy', 'program/qantas-frequent-flyer'],
      held: true,
      balance: 120000,
      balanceCurrency: 'BONVOY',
    },
    { id: 'cc/sample-rewards', kind: 'card', display: 'Sample Rewards Card', issuer: 'SampleBank', beancountName: 'SampleRewards', multiplier: 3 },
    { id: 'currency/usd', kind: 'fiat', display: 'US Dollar', beancountName: 'USD', multiplier: 2.0, hops: 1, path: ['currency/usd', 'program/qantas-frequent-flyer'], fiat: true, held: true },
  ],
  edges: [
    { from: 'program/marriott-bonvoy', to: 'program/qantas-frequent-flyer', kind: 'transfer', ratio_source: 3, ratio_dest: 1, multiplier: 3 },
    { from: 'cc/sample-rewards', to: 'program/marriott-bonvoy', kind: 'earn' },
    { from: 'currency/usd', to: 'program/qantas-frequent-flyer', kind: 'transfer', ratio_source: 200, ratio_dest: 100, multiplier: 2 },
  ],
  notes: ['1 feeder programmes, 1 earning cards, 1 cash buy-ins within 3 transfer hops'],
}
const CURRENCIES: LoyaltyCurrency[] = [
  { slug: FIXTURE.target.slug, name: FIXTURE.target.display, aliases: [] },
  ...FIXTURE.nodes
    .filter((n) => n.kind === 'program')
    .map((n) => ({ slug: n.id, name: n.display, aliases: [] as string[] })),
].sort((a, b) => a.name.localeCompare(b.name))

function Harness({ status = 'ready' as PointsStatus }: { status?: PointsStatus }) {
  const [target, setTarget] = useState(FIXTURE.target.slug)
  const [mineOnly, setMineOnly] = useState(false)
  const [maxHops, setMaxHops] = useState(3)
  const [cardMode, setCardMode] = useState<FilterMode>('include')
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set())
  const [currencyMode, setCurrencyMode] = useState<FilterMode>('include')
  const [selectedCurrencies, setSelectedCurrencies] = useState<Set<string>>(new Set())

  const toggle = (s: React.Dispatch<React.SetStateAction<Set<string>>>, slug: string) =>
    s((p) => {
      const n = new Set(p)
      if (n.has(slug)) n.delete(slug)
      else n.add(slug)
      return n
    })
  const filters: PointsFilters = { mineOnly, maxHops, cardMode, selectedCards, currencyMode, selectedCurrencies }

  return (
    <div className="h-screen">
      <Points
        target={target}
        onTarget={setTarget}
        currencies={CURRENCIES}
        status={status}
        data={status === 'ready' ? FIXTURE : undefined}
        filters={filters}
        onMineOnly={setMineOnly}
        onMaxHops={setMaxHops}
        onCardMode={setCardMode}
        onToggleCard={(s) => toggle(setSelectedCards, s)}
        onToggleBank={(slugs) =>
          setSelectedCards((prev) => {
            const next = new Set(prev)
            const allOn = slugs.every((x) => next.has(x))
            for (const x of slugs) {
              if (allOn) next.delete(x)
              else next.add(x)
            }
            return next
          })
        }
        onCurrencyMode={setCurrencyMode}
        onToggleCurrency={(s) => toggle(setSelectedCurrencies, s)}
      />
    </div>
  )
}

const meta: Meta<typeof Harness> = {
  title: 'Points/PathsToPoints',
  component: Harness,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof Harness>
export const Loaded: Story = { args: { status: 'ready' } }
export const Loading: Story = { args: { status: 'loading' } }
