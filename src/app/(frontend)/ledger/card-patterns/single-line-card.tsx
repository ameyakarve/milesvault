import { type Category, type DisplayDate, formatAmount } from '@/lib/beancount/display'

export type SingleLineVM = {
  date: DisplayDate
  payee: string
  narration: string | null
  amount: number
  currency: string
  paidFrom: string
  category: Category
  cashback: { amount: number; currency: string } | null
  pending: boolean
}

export function SingleLineCard({ vm }: { vm: SingleLineVM }) {
  const secondary = [vm.narration, vm.paidFrom].filter(Boolean).join(' · ')
  return (
    <article className="group flex items-center gap-3 h-[56px] px-4 bg-white border-b border-zinc-100 hover:bg-zinc-50 transition-colors cursor-default">
      <div className="w-[48px] shrink-0 flex flex-col items-center justify-center">
        <span className="text-[11px] leading-[1.1] uppercase tracking-wider text-zinc-500 font-medium">
          {vm.date.month}
        </span>
        <span className="text-[16px] leading-[1.2] text-[#09090B] font-medium">{vm.date.day}</span>
      </div>
      <div className="w-[32px] h-[32px] shrink-0 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <span
          className="material-symbols-outlined !text-[18px]"
          style={{ fontVariationSettings: "'wght' 400" }}
        >
          {vm.category.icon}
        </span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="text-[15px] leading-tight text-[#09090B] font-semibold truncate">
            {vm.payee}
          </span>
          {vm.pending ? (
            <span className="text-[10px] uppercase tracking-wider text-[#B45309] font-medium">
              pending
            </span>
          ) : null}
        </div>
        {secondary ? (
          <span className="text-[13px] leading-tight text-zinc-500 truncate mt-0.5">
            {secondary}
          </span>
        ) : null}
      </div>
      <div className="shrink-0 flex flex-col items-end justify-center min-w-[120px]">
        <span className="text-[16px] font-semibold text-[#09090B] tabular-nums tracking-tight">
          {formatAmount(-vm.amount, vm.currency)}
        </span>
        {vm.cashback ? (
          <span className="text-[11px] text-emerald-700 tabular-nums mt-0.5">
            {formatAmount(vm.cashback.amount, vm.cashback.currency)} cashback
          </span>
        ) : null}
      </div>
    </article>
  )
}
