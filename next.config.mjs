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
const mantineCjs = (pkg) =>
  path.resolve(__dirname, `node_modules/@mantine/${pkg}/cjs/index.cjs`)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit .map files on staging only so the browser console resolves minified
  // traces back to the original TS files. /editor is auth-gated so we can't
  // repro hydration warnings in dev; staging maps fill that gap. Prod builds
  // don't set CLOUDFLARE_ENV, so this stays off there.
  productionBrowserSourceMaps: process.env.CLOUDFLARE_ENV === 'staging',
  serverExternalPackages: ['jose', 'pg-cloudflare'],
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  generateBuildId: async () => buildId,
  webpack: (webpackConfig, { webpack }) => {
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

    // The `agents` package transitively imports `cloudflare:workers` and
    // `cloudflare:email`. Webpack can't bundle those — leave them external
    // so workerd resolves them at runtime.
    const externals = Array.isArray(webpackConfig.externals)
      ? webpackConfig.externals
      : [webpackConfig.externals].filter(Boolean)
    externals.push(({ request }, callback) => {
      if (request && request.startsWith('cloudflare:')) {
        return callback(null, 'commonjs ' + request)
      }
      callback()
    })
    webpackConfig.externals = externals

    return webpackConfig
  },
}

initOpenNextCloudflareForDev()

export default nextConfig
