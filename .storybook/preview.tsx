import type { Preview } from '@storybook/nextjs-vite'
import React from 'react'

import '@/app/(frontend)/styles.css'

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-[#FAFAF9] text-[#09090B] font-sans">
        <Story />
      </div>
    ),
  ],
}

export default preview
