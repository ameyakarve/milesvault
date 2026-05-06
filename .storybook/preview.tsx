import type { Preview } from '@storybook/nextjs-vite'
import React from 'react'
import { MantineProvider } from '@mantine/core'

import '@/app/(frontend)/styles.css'
import '@mantine/core/styles.css'
import '@mantine/charts/styles.css'

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <MantineProvider>
        <div className="min-h-screen bg-[#FAFAF9] text-[#09090B] font-sans">
          <Story />
        </div>
      </MantineProvider>
    ),
  ],
}

export default preview
