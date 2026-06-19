import React from 'react'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './styles.css'
import { VersionWatcher } from '@/components/version-watcher'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata = {
  description: 'MilesVault — personal finance ledger',
  title: 'MilesVault',
}

// Without this, mobile browsers assume a ~980px layout viewport and every
// responsive breakpoint in the app is wrong. `viewportFit: cover` lets the
// fixed chrome (nav rail, status bar) extend under iOS safe-area insets.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  colorScheme: 'light dark' as const,
}

// Apply the stored (or system) theme before first paint — no flash.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} bg-background font-sans text-foreground antialiased`}
      >
        {children}
        <VersionWatcher />
      </body>
    </html>
  )
}
