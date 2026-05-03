import { CheckCircle } from '@phosphor-icons/react/dist/ssr'

export function KumoStatusBar({
  primary = 'Ready',
  count,
}: {
  primary?: string
  count?: number
}) {
  return (
    <footer className="fixed bottom-0 left-[48px] right-0 h-[28px] z-40 bg-[#f2f4f6] border-t border-slate-200 flex items-center justify-between px-4 font-mono text-[10px] uppercase tracking-wider text-slate-500">
      <div className="flex items-center space-x-6">
        {count != null && <span>{count} accounts</span>}
        <span className="text-[#00685f] font-bold flex items-center space-x-1">
          <CheckCircle size={12} weight="fill" />
          <span>Parsed</span>
        </span>
      </div>
      <div className="flex items-center space-x-4">
        <span className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded-full bg-[#00685f]" />
          <span>{primary}</span>
        </span>
        <span>Beancount v2.3.5</span>
      </div>
    </footer>
  )
}
