import React from 'react'
import { NavRail } from '../_chrome/nav-rail'

// The four explorers are now top-level rail items (split across buckets), so the
// shared PlanTabs strip is gone — the rail is the navigation.
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <NavRail />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
