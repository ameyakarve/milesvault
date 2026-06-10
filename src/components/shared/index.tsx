import Link from 'next/link'
import { cn } from '@/lib/utils'

// Shared presentation primitives — the patterns the styling audit found
// hand-rolled 3+ times each. Token-based throughout (dark-mode safe).

// The mono uppercase section heading used on every dashboard surface.
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        'font-mono text-[10px] uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  )
}

// KPI tile: mono number over a quiet label (Vault stats, account overview).
export function StatTile({
  label,
  value,
  sub,
  negative,
}: {
  label: string
  value: string
  sub?: string
  negative?: boolean
}) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-card px-4 py-3">
      <SectionLabel>{label}</SectionLabel>
      <p
        className={cn(
          'font-mono text-2xl font-semibold leading-none',
          negative ? 'text-rose-600 dark:text-rose-400' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {sub ? <p className="font-mono text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

// Lifecycle/status chip — muted tints, consistent shape, dark-aware.
const CHIP_TONES = {
  neutral: 'bg-muted text-muted-foreground border-transparent',
  pending: 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  active: 'bg-sky-50 text-sky-700 border-sky-200/60 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  negative: 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
} as const

export type ChipTone = keyof typeof CHIP_TONES

export function StateChip({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: ChipTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-medium',
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

// Centered empty / loading / error states — one shape everywhere.
export function CenteredState({
  children,
  tone = 'muted',
  action,
}: {
  children: React.ReactNode
  tone?: 'muted' | 'error'
  action?: { label: string; href: string }
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p
        className={cn(
          'max-w-xs text-sm',
          tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {children}
      </p>
      {action ? (
        <Link href={action.href} className="text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline">
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}
