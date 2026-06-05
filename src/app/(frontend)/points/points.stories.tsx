import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { Points, type PointsStatus } from './points-ui'
import type { PointsPathsResult } from '@/durable/agents/tools/concierge/points-paths'
import qantas from './qantas.fixture.json'

const FIXTURE = qantas as unknown as PointsPathsResult

function Harness({ status = 'ready' as PointsStatus }: { status?: PointsStatus }) {
  const [target, setTarget] = useState('Qantas Points')
  const [maxHops, setMaxHops] = useState(3)
  const [showCards, setShowCards] = useState(true)
  const [bestOnly, setBestOnly] = useState(true)
  return (
    <div className="h-screen">
      <Points
        target={target}
        onTarget={setTarget}
        status={status}
        data={status === 'ready' ? FIXTURE : undefined}
        maxHops={maxHops}
        onMaxHops={setMaxHops}
        showCards={showCards}
        onShowCards={setShowCards}
        bestOnly={bestOnly}
        onBestOnly={setBestOnly}
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
