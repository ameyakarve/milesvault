'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type Icon as PhosphorIcon } from '@phosphor-icons/react'
import { ChatCircleDots, NotePencil } from '@phosphor-icons/react/dist/ssr'
import { Map, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Routes that belong to the Plan zone — the Plan nav item is active for any of these.
const PLAN_ROUTES = ['/explore', '/points', '/status-match']

type NavItem =
  | { kind: 'link'; href: string; label: string; Icon: PhosphorIcon }
  | { kind: 'plan'; href: string; label: string }

const ITEMS: NavItem[] = [
  { kind: 'link', href: '/editor', label: 'Editor', Icon: NotePencil },
  { kind: 'link', href: '/concierge', label: 'Concierge', Icon: ChatCircleDots },
  { kind: 'plan', href: '/explore', label: 'Plan' },
]

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

  function isActive(item: NavItem): boolean {
    if (item.kind === 'plan') return PLAN_ROUTES.some((r) => pathname?.startsWith(r))
    return !!pathname?.startsWith(item.href)
  }

  return (
    <>
      {/* Desktop: slim side rail */}
      <nav className="hidden h-screen w-[48px] shrink-0 flex-col items-center gap-6 border-r border-slate-200 bg-white py-4 md:flex">
        <Logo />
        <div className="flex flex-col gap-4">
          {ITEMS.map((item) => {
            const active = isActive(item)
            const iconCls = cn('p-2', active ? 'text-teal-500' : 'text-slate-400 hover:text-slate-600')
            if (item.kind === 'plan') {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  title={item.label}
                  className={iconCls}
                >
                  <Map size={24} />
                </Link>
              )
            }
            const { href, label, Icon } = item
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                title={label}
                className={iconCls}
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
            {ITEMS.map((item) => {
              const active = isActive(item)
              const linkCls = cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                active ? 'bg-slate-100 font-medium text-teal-600' : 'text-slate-600 hover:bg-slate-50',
              )
              if (item.kind === 'plan') {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={linkCls}
                  >
                    <Map size={20} />
                    {item.label}
                  </Link>
                )
              }
              const { href, label, Icon } = item
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={linkCls}
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
