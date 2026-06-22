'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Coins,
  FileText,
  Home,
  Inbox,
  Medal,
  Menu,
  Network,
  PieChart,
  Plane,
  Settings,
  Sparkles,
  SquarePen,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { GlobalCapture } from './global-capture'
import { FeedbackButton } from './feedback-button'
import { ThemeToggle } from './theme-toggle'

type LucideIcon = React.FC<{ size?: number; className?: string }>
type NavItem = { href: string; label: string; Icon: LucideIcon; badge?: 'email' | 'upload' }

// The rail in three zones: Home on top, then two buckets, then account controls
// (Profile, Settings) pinned at the bottom. Bucket A is the money-management
// surface (review + edit + spend); Bucket B is exploration + the assistant.
const HOME: NavItem = { href: '/vault', label: 'Home', Icon: Home }
const BUCKETS: NavItem[][] = [
  [
    { href: '/editor', label: 'Journal', Icon: SquarePen },
    { href: '/statements', label: 'Statements', Icon: FileText, badge: 'upload' },
    { href: '/inbox', label: 'Inbox', Icon: Inbox, badge: 'email' },
    { href: '/accounts', label: 'Expenses', Icon: PieChart },
  ],
  [
    { href: '/explore', label: 'Award Explorer', Icon: Plane },
    { href: '/points', label: 'Points', Icon: Coins },
    { href: '/status-match', label: 'Status Match', Icon: Medal },
    { href: '/airline-explorer', label: 'Partner Matrix', Icon: Network },
    { href: '/concierge', label: 'Assistant', Icon: Sparkles },
  ],
]
const PROFILE: NavItem = { href: '/profile', label: 'Profile', Icon: UserRound }
const SETTINGS: NavItem = { href: '/settings', label: 'Settings', Icon: Settings }

// Pending capture work (extracted/errored, not yet posted or dismissed) for the
// nav badges — split by source so Inbox (email) and Statements (upload) each
// badge only their own queue. Re-polls on a new capture (`mv:captured`) and on
// focus so the badges don't sit stale. Failures read as zero.
function usePendingCaptures(): { email: number; upload: number } {
  const [n, setN] = useState({ email: 0, upload: 0 })
  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/ledger/captures')
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{
                rows?: Array<{ source: string; state: string; draft_error: string | null }>
              }>)
            : null,
        )
        .then((d) => {
          if (cancelled || !d) return
          const rows = d.rows ?? []
          const pending = (src: string) =>
            rows.filter(
              (r) =>
                r.source === src &&
                (r.state === 'extracted' ||
                  (r.draft_error != null && r.state !== 'posted' && r.state !== 'dismissed')),
            ).length
          setN({ email: pending('email'), upload: pending('upload') })
        })
        .catch(() => {})
    }
    load()
    const onCaptured = () => load()
    const onFocus = () => load()
    window.addEventListener('mv:captured', onCaptured)
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('mv:captured', onCaptured)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  return n
}

function Badge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null
  return (
    <span
      aria-label={`${count} pending`}
      className={cn(
        'flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

// Concierge assistant flag — hides the `/concierge` nav item when off. Cosmetic
// only (the page + DO enforce the real gate). Fail-closed: stays hidden until a
// positive answer arrives, so beta users never see it flash.
function useConciergeEnabled(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/flags/concierge')
      .then((r) => (r.ok ? (r.json() as Promise<{ enabled?: boolean }>) : null))
      .then((d) => !cancelled && setOn(!!d?.enabled))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return on
}

export function NavRail() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const pending = usePendingCaptures()
  const conciergeOn = useConciergeEnabled()

  // Drop the assistant item from its bucket when the flag is off.
  const buckets = useMemo(
    () =>
      conciergeOn
        ? BUCKETS
        : BUCKETS.map((bucket) => bucket.filter((item) => item.href !== '/concierge')),
    [conciergeOn],
  )

  const isActive = (href: string) => !!pathname?.startsWith(href)
  const badgeFor = (item: NavItem) =>
    item.badge === 'email' ? pending.email : item.badge === 'upload' ? pending.upload : 0

  // ---- desktop: slim icon rail, with a fast tooltip per icon ----
  const railIcon = (item: NavItem) => {
    const active = isActive(item.href)
    const count = badgeFor(item)
    return (
      <Tooltip key={item.href}>
        <TooltipTrigger
          render={
            <Link
              href={item.href}
              aria-label={item.label}
              className={cn(
                'relative rounded-lg p-2',
                active
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            />
          }
        >
          <item.Icon size={22} />
          {count > 0 ? <Badge count={count} className="absolute right-0 top-0" /> : null}
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    )
  }
  const Divider = () => <div className="my-1 h-px w-5 self-center bg-border" />

  // ---- mobile: labeled rows ----
  const menuRow = (item: NavItem) => {
    const active = isActive(item.href)
    const count = badgeFor(item)
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
          active
            ? 'bg-muted font-medium text-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <item.Icon size={18} />
        {item.label}
        {count > 0 ? <Badge count={count} className="ml-auto" /> : null}
      </Link>
    )
  }

  return (
    <>
      {/* Global drag-and-drop capture overlay — single shared mount point. */}
      <GlobalCapture />

      {/* Floating beta-feedback widget — present on every authed page. */}
      <FeedbackButton />

      {/* Desktop: slim side rail. delay=150ms → tooltips appear quickly. */}
      <TooltipProvider delay={150}>
        <nav className="hidden h-screen w-[48px] shrink-0 flex-col items-center overflow-y-auto border-r border-border bg-background py-3 md:flex">
          <div className="flex flex-col gap-1">
            {railIcon(HOME)}
            {buckets.map((bucket, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <Divider />
                {bucket.map(railIcon)}
              </div>
            ))}
          </div>
          <div className="mt-auto flex flex-col items-center gap-1 pt-2">
            {railIcon(PROFILE)}
            {railIcon(SETTINGS)}
            <ThemeToggle className="rounded-lg p-2 text-muted-foreground hover:text-foreground" />
          </div>
        </nav>
      </TooltipProvider>

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
        <span className="text-sm font-semibold tracking-tight">MilesVault</span>
      </header>

      {/* Mobile menu */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">MilesVault</DialogTitle>
          </DialogHeader>
          <nav className="flex flex-col gap-1">
            {menuRow(HOME)}
            {buckets.map((bucket, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="my-1 border-t border-border" />
                {bucket.map(menuRow)}
              </div>
            ))}
            <div className="my-1 border-t border-border" />
            {menuRow(PROFILE)}
            {menuRow(SETTINGS)}
          </nav>
          <div className="border-t border-border pt-2">
            <ThemeToggle className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
