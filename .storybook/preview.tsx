import type { Preview } from '@storybook/nextjs-vite'
import React from 'react'

import '@/app/(frontend)/styles.css'
import '@/app/(frontend)/kumo/theme-overrides.css'

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => {
      if (typeof document !== 'undefined') {
        document.body.dataset.mode = 'light'
        document.body.dataset.theme = 'kumo'
        document.body.classList.add('kumo-root')
      }
      return (
        <div className="min-h-screen bg-[#FAFAF9] text-[#09090B] font-sans">
          <Story />
        </div>
      )
    },
  ],
}

export default preview
