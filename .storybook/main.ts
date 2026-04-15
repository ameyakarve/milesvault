import type { StorybookConfig } from '@storybook/nextjs-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  typescript: {
    check: false,
    reactDocgen: false,
  },
}

export default config
