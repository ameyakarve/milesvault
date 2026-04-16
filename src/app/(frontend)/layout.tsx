import Script from 'next/script'
import React from 'react'
import './styles.css'

export const metadata = {
  description: 'MilesVault — personal finance ledger',
  title: 'MilesVault',
}

const tailwindConfig = `tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#0A2540",
        "ink": "#0A1628",
        "muted": "#6B7889",
        "slate-bg": "#E5ECF5",
        "mint-bg": "#DDEAE2",
        "plum-bg": "#ECE5EA",
        "saffron-bg": "#F0E9DC",
        "chip-bg": "#EEF2F7",
        "hover-row": "#F4F6F9"
      }
    }
  }
}`

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
        <Script
          src="https://cdn.tailwindcss.com?plugins=forms,container-queries"
          strategy="beforeInteractive"
        />
        <Script id="tailwind-config" strategy="beforeInteractive">
          {tailwindConfig}
        </Script>
      </head>
      <body className="bg-[#FBFCFD]">{children}</body>
    </html>
  )
}
