import React from 'react'
import { MantineProvider, ColorSchemeScript, mantineHtmlProps } from '@mantine/core'
import './styles.css'
import './theme-overrides.css'
import '@mantine/core/styles.css'
import '@mantine/charts/styles.css'

export const metadata = {
  description: 'MilesVault — personal finance ledger',
  title: 'MilesVault',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
        <link rel="stylesheet" href="/kumo/standalone.css" />
      </head>
      <body
        data-mode="light"
        data-theme="kumo"
        className="kumo-root bg-[#FBFCFD]"
      >
        <MantineProvider>{children}</MantineProvider>
      </body>
    </html>
  )
}
