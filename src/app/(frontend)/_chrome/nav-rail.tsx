'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AirplaneTilt, ArrowsClockwise, ChatCircleDots, NotePencil } from '@phosphor-icons/react/dist/ssr'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const ITEMS = [
  { href: '/editor', label: 'Editor', Icon: NotePencil },
  { href: '/concierge', label: 'Concierge', Icon: ChatCircleDots },
  { href: '/explore', label: 'Award Explorer', Icon: AirplaneTilt },
  { href: '/status-match', label: 'Status Match', Icon: ArrowsClockwise },
] as const

function Logo() {
  return (
    <div className="flex size-8 items-center justify-center rounded-[6px] bg-teal-500 text-lg font-black text-white">
      M
    </div>
  )
}

export function NavRail() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Desktop: slim side rail */}
      <nav className="hidden h-screen w-[48px] shrink-0 flex-col items-center gap-6 border-r border-slate-200 bg-white py-4 md:flex">
        <Logo />
        <div className="flex flex-col gap-4">
          {ITEMS.map(({ href, label, Icon }) => {
            const active = pathname?.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                title={label}
                className={cn('p-2', active ? 'text-teal-500' : 'text-slate-400 hover:text-slate-600')}
              >
                <Icon size={24} weight="regular" />
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Mobile: top bar with a hamburger */}
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <Logo />
      </header>

      {/* Mobile menu */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">MilesVault</DialogTitle>
          </DialogHeader>
          <nav className="flex flex-col gap-1">
            {ITEMS.map(({ href, label, Icon }) => {
              const active = pathname?.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                    active
                      ? 'bg-slate-100 font-medium text-teal-600'
                      : 'text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <Icon size={20} weight="regular" />
                  {label}
                </Link>
              )
            })}
          </nav>
        </DialogContent>
      </Dialog>
    </>
  )
}
