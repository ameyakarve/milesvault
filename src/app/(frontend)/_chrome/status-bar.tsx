import { CheckCircle } from '@phosphor-icons/react/dist/ssr'

export function StatusBar({
  primary = 'Ready',
  count,
}: {
  primary?: string
  count?: number
}) {
  return (
    <footer aria-label="App status" className="fixed bottom-0 left-0 md:left-[48px] right-0 h-[28px] z-40 bg-muted border-t border-border flex items-center justify-between px-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <div className="flex items-center space-x-6">
        {count != null && <span>{count} accounts</span>}
        <span className="text-foreground font-bold flex items-center space-x-1">
          <CheckCircle size={12} weight="fill" />
          <span>Parsed</span>
        </span>
      </div>
      <div className="flex items-center space-x-4">
        <span className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded-full bg-foreground" />
          <span>{primary}</span>
        </span>
        <span>Beancount v2.3.5</span>
      </div>
    </footer>
  )
}
