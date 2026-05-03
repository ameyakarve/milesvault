import React from 'react'
import './theme-overrides.css'

// Temporary parallel UI rendered with Cloudflare's Kumo component library.
// Scoped to the /kumo subtree so the existing v3 Tailwind setup elsewhere is
// untouched. Theme overrides remap Kumo's brand tokens to MilesVault palette.
//
// kumo-standalone.css is the pre-compiled Tailwind v4 + Kumo bundle. We load
// it as a static asset (copied from node_modules into public/kumo/) to bypass
// our project's Tailwind v3 PostCSS pipeline, which would otherwise choke on
// v4 directives. Refresh the asset with `pnpm run kumo:sync` if Kumo updates.
export default function KumoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/kumo/standalone.css" />
      <div data-mode="light" data-theme="kumo" className="kumo-root min-h-screen">
        {children}
      </div>
    </>
  )
}
