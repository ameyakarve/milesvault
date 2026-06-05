import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ExploreLinkCard } from './explore-link'

const meta: Meta<typeof ExploreLinkCard> = {
  title: 'GenUI/ExploreLink',
  component: ExploreLinkCard,
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj<typeof ExploreLinkCard>

export const WithSource: Story = {
  render: () => (
    <div className="max-w-md">
      <ExploreLinkCard input={{ origin: 'BLR', destination: 'NRT', source: 'Axis Magnus Burgundy' }} />
    </div>
  ),
}

export const NoSource: Story = {
  render: () => (
    <div className="max-w-md">
      <ExploreLinkCard input={{ origin: 'DEL', destination: 'LHR', source: '' }} />
    </div>
  ),
}
