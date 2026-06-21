import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProgrammeCard } from './vault-view'

const meta: Meta = { title: 'Vault/ProgrammeTile' }
export default meta

// Synthetic fixtures — public programme names, invented round numbers, no real
// data. Exercises the full-color programme art, marks, and multi-counter status.
const PROGRAMMES: Array<{
  account: string
  currency: string
  posted: number
  pending: number
  status: Array<{ value: number; commodity: string }>
  category?: 'airline' | 'hotel' | 'aggregator'
}> = [
  {
    account: 'Assets:Rewards:Points:Marriott',
    currency: 'MARRIOTT',
    posted: 142500,
    pending: 3200,
    status: [
      { value: 32, commodity: 'MAR-NIGHTS' },
      { value: 85000, commodity: 'MAR-STATUS' },
    ],
  },
  {
    account: 'Assets:Rewards:Points:Hilton',
    currency: 'HILTON',
    posted: 64000,
    pending: 0,
    status: [{ value: 18, commodity: 'HH-NIGHTS' }],
  },
  {
    account: 'Assets:Rewards:Miles:KrisFlyer',
    currency: 'KRISFLYER',
    posted: 124500,
    pending: 0,
    status: [
      { value: 418, commodity: 'KF-STATUS' },
      { value: 12, commodity: 'KF-SEGMENTS' },
    ],
  },
  {
    account: 'Assets:Rewards:Miles:Emirates',
    currency: 'SKYWARDS',
    posted: 78000,
    pending: 1500,
    status: [{ value: 5400, commodity: 'EK-TIERMILES' }],
  },
  {
    account: 'Assets:Rewards:Miles:Qatar',
    currency: 'AVIOS',
    posted: 33000,
    pending: 0,
    status: [{ value: 240, commodity: 'QR-QPOINTS' }],
  },
  {
    account: 'Assets:Rewards:Miles:Lufthansa',
    currency: 'LUFTHANSA',
    posted: 51000,
    pending: 0,
    status: [],
  },
  {
    account: 'Assets:Rewards:Miles:United',
    currency: 'UNITED',
    posted: 96000,
    pending: 0,
    status: [{ value: 7, commodity: 'UA-PQF' }],
  },
  {
    account: 'Assets:Rewards:Miles:Maharaja',
    currency: 'MAHARAJA',
    posted: 21000,
    pending: 0,
    status: [{ value: 9000, commodity: 'AI-POINTS' }],
  },
  {
    account: 'Assets:Rewards:Miles:Aggro',
    currency: 'AGGRO',
    posted: 4200,
    pending: 0,
    status: [],
    category: 'aggregator',
  },
]

export const Default: StoryObj = {
  render: () => (
    <div className="grid max-w-5xl grid-cols-1 gap-3 bg-background p-6 sm:grid-cols-2 lg:grid-cols-3">
      {PROGRAMMES.map((p) => (
        <ProgrammeCard
          key={p.account}
          holding={{
            account: p.account,
            currency: p.currency,
            posted: p.posted,
            pending: p.pending,
          }}
          names={{}}
          status={p.status}
          category={p.category}
        />
      ))}
    </div>
  ),
}
