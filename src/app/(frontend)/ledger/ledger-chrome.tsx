import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function ChromeIconButton({
  icon: IconCmp,
  title,
  onClick,
  disabled = false,
  dirty = false,
}: {
  icon: LucideIcon
  title: string
  onClick?: () => void
  disabled?: boolean
  dirty?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="w-[28px] h-[28px] flex items-center justify-center rounded-[2px] hover:bg-white transition-colors relative"
    >
      <IconCmp size={16} strokeWidth={1.5} className="text-slate-600" />
      {dirty && (
        <span className="absolute top-[6px] right-[6px] w-[6px] h-[6px] bg-scandi-accent rounded-[2px]" />
      )}
    </button>
  )
}

export function PaneLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-700">
      {children}
    </h2>
  )
}

export function PaneCap({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`h-[28px] shrink-0 px-3 flex items-center bg-scandi-cap shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_0_rgba(15,23,42,0.04)] min-w-0 ${className}`}
    >
      {children}
    </div>
  )
}
