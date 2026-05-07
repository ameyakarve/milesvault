import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const buildId =
  process.env.BUILD_ID ??
  process.env.GITHUB_SHA ??
  process.env.CF_PAGES_COMMIT_SHA ??
  `dev-${Date.now()}`

// Mantine 9's ESM build does `import { Activity, useEffectEvent } from 'react'`,
// which webpack's static analyzer can't see in React 19.2's CJS bundle (the
// runtime conditional `module.exports = require('./cjs/...')` defeats the
// lexer). Force the CJS build of @mantine/* — its files use `react.Activity`
// runtime property access, which webpack resolves fine.
const mantineCjs = (pkg: string) =>
  path.resolve(__dirname, `node_modules/@mantine/${pkg}/cjs/index.cjs`)

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['jose', 'pg-cloudflare'],
  productionBrowserSourceMaps: process.env.CLOUDFLARE_ENV === 'staging',
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  generateBuildId: async () => buildId,
  webpack: (webpackConfig: any, { webpack }: { webpack: any }) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      '@mantine/core$': mantineCjs('core'),
      '@mantine/charts$': mantineCjs('charts'),
      '@mantine/dates$': mantineCjs('dates'),
      '@mantine/hooks$': mantineCjs('hooks'),
    }

    webpackConfig.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/parseFile\.mjs$/,
        contextRegExp: /beancount/,
      }),
    )

    return webpackConfig
  },
}

initOpenNextCloudflareForDev()

export default nextConfig
