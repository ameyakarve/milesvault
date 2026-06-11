import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { AddCardModal } from './add-card-modal'

const meta: Meta = { title: 'AddCard/Modal' }
export default meta

function Demo() {
  const [open, setOpen] = useState(true)
  return (
    <div className="h-[520px] bg-background p-6">
      <button onClick={() => setOpen(true)} className="text-sm underline">open</button>
      <AddCardModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
export const Default: StoryObj = { render: () => <Demo /> }
