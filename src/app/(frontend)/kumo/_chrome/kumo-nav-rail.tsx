'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@cloudflare/kumo/components/button'
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
  { href: '/kumo/ledger', label: 'Accounts', icon: Books },
  { href: '/kumo/insights', label: 'Insights', icon: ChartLineUp },
  { href: '/kumo/ideas', label: 'Ideas', icon: Lightbulb },
]

const BOTTOM: NavItem[] = [{ href: '/kumo/settings', label: 'Settings', icon: GearSix }]

export function KumoNavRail() {
  const router = useRouter()
  const pathname = usePathname()

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    return (
      <Button
        key={item.href}
        type="button"
        variant={active ? 'primary' : 'ghost'}
        shape="square"
        size="sm"
        icon={<Icon size={18} weight={active ? 'fill' : 'regular'} />}
        aria-label={item.label}
        title={item.label}
        onClick={() => router.push(item.href)}
      />
    )
  }

  return (
    <nav className="flex h-screen w-[56px] flex-shrink-0 flex-col items-center gap-2 border-r border-kumo-line bg-kumo-base py-3">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-kumo-brand text-base font-black text-white">
        M
      </div>
      <div className="flex flex-col gap-1">{TOP.map(renderItem)}</div>
      <div className="mt-auto flex flex-col gap-1">{BOTTOM.map(renderItem)}</div>
    </nav>
  )
}
