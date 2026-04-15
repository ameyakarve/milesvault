import type { Preview } from '@storybook/nextjs-vite'
import React from 'react'

import '@/app/(frontend)/chat/chat.css'

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: '100vh',
          padding: 24,
          background: '#111',
          color: '#e6e6e6',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default preview
