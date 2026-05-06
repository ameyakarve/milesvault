import type { Preview } from '@storybook/nextjs-vite'
import React from 'react'
import { MantineProvider } from '@mantine/core'

import '@/app/(frontend)/styles.css'
import '@/app/(frontend)/theme-overrides.css'
import '@mantine/core/styles.css'
import '@mantine/charts/styles.css'

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
        <MantineProvider>
          <div className="min-h-screen bg-[#FAFAF9] text-[#09090B] font-sans">
            <Story />
          </div>
        </MantineProvider>
      )
    },
  ],
}

export default preview
