import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['jose', 'pg-cloudflare'],
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
