import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddCardCard } from '@/app/(frontend)/ai/gen-ui/add-card'

const meta: Meta = { title: 'AddCard/Picker' }
export default meta

// The picker body (the modal wraps this in a Dialog; render the body so the
// story doesn't need portal/overlay plumbing).
export const Default: StoryObj = {
  render: () => (
    <div className="max-w-md bg-background p-6">
      <AddCardCard input={{ prompt: 'Add a card' }} status="idle" onResult={() => {}} onReject={() => {}} />
    </div>
  ),
}
