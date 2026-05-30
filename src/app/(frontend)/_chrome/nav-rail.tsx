'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChatCircleDots, NotePencil } from '@phosphor-icons/react/dist/ssr'

const ITEMS = [
  { href: '/editor', label: 'Editor', Icon: NotePencil },
  { href: '/concierge', label: 'Concierge', Icon: ChatCircleDots },
] as const

export function NavRail() {
  const pathname = usePathname()
  return (
    <nav className="bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-6 w-[48px] h-screen shrink-0">
      <div className="w-8 h-8 bg-teal-500 flex items-center justify-center rounded-[6px] text-white font-black text-lg">
        M
      </div>
      <div className="flex flex-col gap-4">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname?.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={label}
              className={`p-2 ${active ? 'text-teal-500' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Icon size={24} weight="regular" />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
