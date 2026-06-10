import { cn } from '@/lib/utils'

// The one toolbar treatment for all three Plan pages: full-width card strip
// under the Plan tabs, same height/padding/background everywhere. Controls
// flow left; `meta` (result counts etc.) docks right.
export function PlanToolbar({
  children,
  meta,
  className,
}: {
  children: React.ReactNode
  meta?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-12 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2',
        className,
      )}
    >
      {children}
      {meta ? <span className="ml-auto text-xs text-muted-foreground">{meta}</span> : null}
    </div>
  )
}

// Shared active-tab treatment for shadcn TabsTrigger — the neutral token
// scheme has --muted ≈ --background, so the default active style is
// invisible without this.
export const TAB_ACTIVE =
  'aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm'
