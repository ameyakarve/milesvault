'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  House,
  Books,
  ChartLineUp,
  GearSix,
  Lightbulb,
} from '@phosphor-icons/react/dist/ssr'

type NavItem = { href: string; label: string; icon: React.ElementType }

const TOP: NavItem[] = [
  { href: '/kumo/home', label: 'Home', icon: House },
  { href: '/kumo/insights', label: 'Insights', icon: ChartLineUp },
  { href: '/kumo/ideas', label: 'Ideas', icon: Lightbulb },
  { href: '/kumo/ledger', label: 'Accounts', icon: Books },
]

const BOTTOM: NavItem[] = [{ href: '/kumo/settings', label: 'Settings', icon: GearSix }]

export function KumoNavRail() {
  const router = useRouter()
  const pathname = usePathname()

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    return (
      <button
        key={item.href}
        type="button"
        onClick={() => router.push(item.href)}
        aria-label={item.label}
        title={item.label}
        className={`p-2 cursor-pointer transition-all ${
          active ? 'text-teal-500' : 'text-slate-400 hover:text-teal-500'
        }`}
      >
        <Icon size={24} weight="regular" />
      </button>
    )
  }

  return (
    <nav className="bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-6 w-[48px] h-screen shrink-0">
      <div className="w-8 h-8 bg-teal-500 flex items-center justify-center rounded-[6px] text-white font-black text-lg">
        M
      </div>
      <div className="flex flex-col gap-4">{TOP.map(renderItem)}</div>
      <div className="mt-auto flex flex-col gap-4 items-center">{BOTTOM.map(renderItem)}</div>
    </nav>
  )
}
