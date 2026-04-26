import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HomeChrome } from './home-chrome'

const meta: Meta<typeof HomeChrome> = {
  title: 'Home / Chrome',
  component: HomeChrome,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof HomeChrome>

export const Default: Story = {}
