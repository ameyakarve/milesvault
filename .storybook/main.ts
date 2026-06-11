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
    // Pre-bundle next/link & friends: on-demand optimization 504s
    // ("Outdated Optimize Dep") the first time a story pulls them in.
    cfg.optimizeDeps = {
      ...(cfg.optimizeDeps ?? {}),
      include: [...(cfg.optimizeDeps?.include ?? []), 'next/link', 'next/navigation'],
    }
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
