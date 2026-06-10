'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type Icon as PhosphorIcon } from '@phosphor-icons/react'
import { ChatCircleDots, NotePencil } from '@phosphor-icons/react/dist/ssr'
import { Inbox, Map, Menu, Vault } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GlobalCapture } from './global-capture'
import { ThemeToggle } from './theme-toggle'

// Routes that belong to the Plan zone — the Plan nav item is active for any of these.
const PLAN_ROUTES = ['/explore', '/points', '/status-match']

type NavItem =
  | { kind: 'link'; href: string; label: string; Icon: PhosphorIcon }
  | { kind: 'plan'; href: string; label: string }
  | { kind: 'lucide'; href: string; label: string; LIcon: React.FC<{ size?: number; className?: string }> }

// Daily-flow order: glance (Vault) → clear the queue (Inbox) → plan → ask
// (Assistant) → audit (Journal, the power-user terminus).
const ITEMS: NavItem[] = [
  { kind: 'lucide', href: '/vault', label: 'Vault', LIcon: Vault },
  { kind: 'lucide', href: '/inbox', label: 'Inbox', LIcon: Inbox },
  { kind: 'plan', href: '/explore', label: 'Plan' },
  { kind: 'link', href: '/concierge', label: 'Assistant', Icon: ChatCircleDots },
  { kind: 'link', href: '/editor', label: 'Journal', Icon: NotePencil },
]

// Pending Inbox work (captured/extracted, not yet posted or dismissed) for
// the nav badge. One fetch per mount; failures read as zero.
function usePendingCaptures(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/captures')
      .then((r) => (r.ok ? (r.json() as Promise<{ rows?: Array<{ state: string }> }>) : null))
      .then((d) => {
        if (cancelled || !d) return
        const rows = d.rows ?? []
        setN(rows.filter((r) => r.state === 'captured' || r.state === 'extracted').length)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return n
}

function InboxBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null
  return (
    <span
      className={cn(
        'flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

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
  const pending = usePendingCaptures()

  function isActive(item: NavItem): boolean {
    if (item.kind === 'plan') return PLAN_ROUTES.some((r) => pathname?.startsWith(r))
    return !!pathname?.startsWith(item.href)
  }

  return (
    <>
      {/* Global drag-and-drop capture overlay — mounted here because NavRail
          is the single shared mount point across every authed page. It renders
          nothing on /editor where the chat tab has its own attach flow. */}
      <GlobalCapture />
      {/* Desktop: slim side rail */}
      <nav className="hidden h-screen w-[48px] shrink-0 flex-col items-center gap-6 border-r border-border bg-background py-4 md:flex">
        <Logo />
        <div className="flex flex-col gap-4">
          {ITEMS.map((item) => {
            const active = isActive(item)
            const iconCls = cn('p-2', active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')
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
            if (item.kind === 'lucide') {
              const { href, label, LIcon } = item
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  title={label}
                  className={cn(iconCls, 'relative')}
                >
                  <LIcon size={24} />
                  {href === '/inbox' ? (
                    <InboxBadge count={pending} className="absolute right-0 top-0" />
                  ) : null}
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
        <ThemeToggle className="mt-auto p-2 text-muted-foreground hover:text-foreground" />
      </nav>

      {/* Mobile: top bar with a hamburger */}
      <header className="flex items-center gap-2 border-b border-border bg-background px-3 py-2 md:hidden">
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
                active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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
              if (item.kind === 'lucide') {
                const { href, label, LIcon } = item
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={linkCls}
                  >
                    <LIcon size={20} />
                    {label}
                    {href === '/inbox' ? <InboxBadge count={pending} className="ml-auto" /> : null}
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
          <div className="border-t border-border pt-2">
            <ThemeToggle className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground w-full" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
