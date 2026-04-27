import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PerAccountView } from './per-account-view'

const meta: Meta<typeof PerAccountView> = {
  title: 'Ledger V4 / Per-Account View',
  component: PerAccountView,
  parameters: {
    layout: 'fullscreen',
  },
}
export default meta

type Story = StoryObj<typeof PerAccountView>

export const HdfcDinersBlack: Story = {
  args: { account: 'Liabilities:CreditCard:HDFC:DinersBlack' },
}
