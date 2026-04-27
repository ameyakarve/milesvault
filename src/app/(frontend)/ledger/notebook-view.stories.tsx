import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { NotebookView } from './notebook-view'

const meta: Meta<typeof NotebookView> = {
  title: 'Ledger / Notebook View',
  component: NotebookView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
}
export default meta

type Story = StoryObj<typeof NotebookView>

export const Default: Story = {}
