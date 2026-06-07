import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { Points, type PointsStatus, type FilterMode, type PointsFilters } from './points-ui'
import type { PointsPathsResult } from '@/durable/agents/tools/concierge/points-paths'
import type { LoyaltyCurrency } from '@/durable/agents/tools/concierge/loyalty-currencies'
import qantas from './qantas.fixture.json'

const FIXTURE = qantas as unknown as PointsPathsResult
const CURRENCIES: LoyaltyCurrency[] = [
  { slug: FIXTURE.target.slug, name: FIXTURE.target.display },
  ...FIXTURE.nodes
    .filter((n) => n.kind === 'currency')
    .map((n) => ({ slug: n.id, name: n.display })),
].sort((a, b) => a.name.localeCompare(b.name))

function Harness({ status = 'ready' as PointsStatus }: { status?: PointsStatus }) {
  const [target, setTarget] = useState(FIXTURE.target.slug)
  const [mineOnly, setMineOnly] = useState(false)
  const [maxHops, setMaxHops] = useState(3)
  const [bestOnly, setBestOnly] = useState(true)
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
  const filters: PointsFilters = { mineOnly, maxHops, bestOnly, cardMode, selectedCards, currencyMode, selectedCurrencies }

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
        onBestOnly={setBestOnly}
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
