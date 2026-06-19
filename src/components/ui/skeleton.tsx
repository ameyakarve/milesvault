import { cn } from '@/lib/utils'

// A pulsing placeholder block. Use to mirror a screen's known layout while data
// loads (skeleton cards/rows) instead of a bare centered "Loading…" — far less
// reflow jank. Respects prefers-reduced-motion via the global CSS guard.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
