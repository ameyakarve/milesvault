'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const PLAN_TABS = [
  { href: '/explore', label: 'Award Explorer' },
  { href: '/points', label: 'Points' },
  { href: '/status-match', label: 'Status Match' },
] as const

export function PlanTabs() {
  const pathname = usePathname()

  return (
    <div className="border-b bg-white">
      <div className="flex items-center gap-0 overflow-x-auto px-3 sm:px-4">
        {PLAN_TABS.map(({ href, label }) => {
          const active = pathname?.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
