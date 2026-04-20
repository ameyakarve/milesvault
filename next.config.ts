import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const buildId =
  process.env.BUILD_ID ??
  process.env.GITHUB_SHA ??
  process.env.CF_PAGES_COMMIT_SHA ??
  `dev-${Date.now()}`

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['jose', 'pg-cloudflare'],
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
