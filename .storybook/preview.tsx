import type { Preview } from '@storybook/nextjs-vite'
import React from 'react'

import '@/app/(frontend)/styles.css'

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background font-sans text-foreground">
        <Story />
      </div>
    ),
  ],
}

export default preview
