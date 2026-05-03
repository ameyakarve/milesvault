import { CheckCircle, Circle } from '@phosphor-icons/react/dist/ssr'

// Slim status footer used across kumo routes. Mirrors the legacy chrome's
// bottom rail but uses Kumo tokens + Phosphor icons.
export function KumoStatusBar({
  primary = 'Ready',
  secondary,
}: {
  primary?: string
  secondary?: string
}) {
  return (
    <footer className="flex h-7 flex-shrink-0 items-center justify-between border-t border-kumo-line bg-kumo-elevated px-4 font-mono text-[10px] uppercase tracking-wider text-kumo-subtle">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1 text-kumo-brand">
          <CheckCircle size={12} weight="fill" />
          <span className="font-bold">Parsed</span>
        </span>
        {secondary && <span>{secondary}</span>}
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <Circle size={8} weight="fill" className="text-kumo-brand" />
          <span>{primary}</span>
        </span>
        <span>Beancount v2.3.5</span>
      </div>
    </footer>
  )
}
