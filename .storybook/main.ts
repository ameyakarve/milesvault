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
  viteFinal: async (cfg) => {
    cfg.define = {
      ...(cfg.define ?? {}),
      __dirname: '"/"',
      __filename: '"/index.js"',
      'process.env.STORYBOOK': '"true"',
    }
    return cfg
  },
}

export default config
