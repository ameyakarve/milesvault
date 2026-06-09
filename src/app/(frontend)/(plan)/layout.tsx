import React from 'react'
import { NavRail } from '../_chrome/nav-rail'
import { PlanTabs } from '../_chrome/plan-tabs'

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#fbfbfa]">
      <NavRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <PlanTabs />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
