import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  // Packages with Cloudflare Workers (workerd) specific code
  // Read more: https://opennext.js.org/cloudflare/howtos/workerd
  serverExternalPackages: ['jose', 'pg-cloudflare'],

  // Your Next.js config here
  webpack: (webpackConfig: any, { webpack }: { webpack: any }) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    // beancount's parseFile.mjs pulls in node:fs/promises and node:path via
    // fileSystemHelpers.mjs; we only use parse() on in-memory text, so stub
    // the parseFile re-export out of the bundle.
    webpackConfig.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/parseFile\.mjs$/,
        contextRegExp: /beancount/,
      }),
    )

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
