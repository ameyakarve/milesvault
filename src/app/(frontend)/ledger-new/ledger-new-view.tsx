type PillKind = 'proposed' | 'split' | 'forex' | 'dcc' | 'benefit'

type CardRow = {
  month: string
  day: string
  glyph: string
  payee: string
  narration: string
  account: string
  rewards: { old?: string; current: string }
  amount: string
  state?: 'staged' | 'focused'
  pill?: { label: string; kind: PillKind }
}

const rows: CardRow[] = [
  {
    month: 'OCT',
    day: '24',
    glyph: 'restaurant',
    payee: 'Swiggy',
    narration: '· dinner with r',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+87', current: '+5,800 pts' },
    amount: '-₹640.00',
    state: 'staged',
    pill: { label: 'proposed', kind: 'proposed' },
  },
  {
    month: 'OCT',
    day: '23',
    glyph: 'shopping_bag',
    payee: 'Zepto',
    narration: '· weekend restock',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+2,480 pts' },
    amount: '-₹320.00',
  },
  {
    month: 'OCT',
    day: '22',
    glyph: 'directions_car',
    payee: 'Uber',
    narration: '· ride to office',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+320 pts' },
    amount: '-₹450.00',
    state: 'focused',
  },
  {
    month: 'OCT',
    day: '21',
    glyph: 'restaurant',
    payee: 'Meat Masterz',
    narration: '· weekend order',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+164', current: '+328 pts' },
    amount: '-₹1,250.00',
    state: 'staged',
    pill: { label: 'proposed', kind: 'proposed' },
  },
  {
    month: 'OCT',
    day: '20',
    glyph: 'account_balance',
    payee: 'HDFC',
    narration: '· oct statement payment',
    account: 'Assets:Bank:HDFC → Liabilities:CreditCard:Axis',
    rewards: { current: '—' },
    amount: '-₹48,200.00',
  },
  {
    month: 'OCT',
    day: '18',
    glyph: 'inventory_2',
    payee: 'Amazon',
    narration: '· monitor & cables',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+45', current: '+90 pts' },
    amount: '-₹4,500.00',
    state: 'staged',
    pill: { label: 'split', kind: 'split' },
  },
  {
    month: 'OCT',
    day: '17',
    glyph: 'movie',
    payee: 'Netflix',
    narration: '· premium renewal',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+258 pts' },
    amount: '-₹1,292.00',
    pill: { label: 'forex', kind: 'forex' },
  },
  {
    month: 'OCT',
    day: '16',
    glyph: 'local_activity',
    payee: 'BookMyShow',
    narration: '· dune part two',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+96 pts' },
    amount: '-₹480.00',
  },
  {
    month: 'OCT',
    day: '14',
    glyph: 'restaurant_menu',
    payee: 'EazyDiner',
    narration: '· complimentary visit',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '—' },
    amount: '-₹0.00',
    pill: { label: 'benefit', kind: 'benefit' },
  },
  {
    month: 'OCT',
    day: '12',
    glyph: 'redeem',
    payee: 'Smartbuy',
    narration: '· points → voucher',
    account: 'Assets:Rewards:Axis → Assets:GiftCards:Amazon',
    rewards: { current: '-35,000 pts' },
    amount: '+₹3,500.00',
  },
  {
    month: 'OCT',
    day: '10',
    glyph: 'hotel',
    payee: 'Cleartrip',
    narration: '· delhi hotel',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+1,748 pts' },
    amount: '-₹8,740.00',
    pill: { label: 'dcc', kind: 'dcc' },
  },
  {
    month: 'OCT',
    day: '07',
    glyph: 'payments',
    payee: 'Payroll',
    narration: '· oct salary credit',
    account: 'Income:Salary → Assets:Bank:HDFC',
    rewards: { current: '—' },
    amount: '+₹2,50,000.00',
  },
]

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden>
      {name}
    </span>
  )
}

function Pill({ kind, label }: { kind: PillKind; label: string }) {
  const styles: Record<PillKind, string> = {
    proposed: 'bg-white border border-sky-200 text-sky-700',
    split: 'bg-slate-100 text-slate-600 border border-slate-200',
    forex: 'bg-slate-100 text-slate-600 border border-slate-200',
    dcc: 'bg-slate-100 text-slate-600 border border-slate-200',
    benefit: 'bg-slate-100 text-slate-600 border border-slate-200',
  }
  return (
    <span
      className={`${styles[kind]} text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm flex items-center gap-1 leading-none shadow-sm ml-auto`}
    >
      {kind === 'proposed' && <Icon name="auto_awesome" className="text-[10px]" />}
      {label}
    </span>
  )
}

function Card({ row }: { row: CardRow }) {
  const shell =
    row.state === 'staged'
      ? 'bg-sky-50/50 hover:bg-sky-50 border border-sky-100'
      : row.state === 'focused'
        ? 'bg-navy-50/50 border border-navy-200'
        : 'hover:bg-slate-50 border border-transparent'

  const tile =
    row.state === 'staged'
      ? 'border-sky-200'
      : 'border-slate-200'

  const tileHead =
    row.state === 'staged'
      ? 'bg-sky-50 text-sky-700 border-b border-sky-100'
      : 'bg-slate-50 text-slate-500 border-b border-slate-100'

  return (
    <div
      className={`h-[52px] rounded-lg flex items-center px-3 gap-3 relative transition-colors ${shell}`}
    >
      <div
        className={`h-10 w-10 rounded-[6px] border flex flex-col shrink-0 relative bg-white overflow-hidden ${tile}`}
      >
        <div
          className={`h-3 text-[10px] font-medium flex items-center justify-center uppercase leading-none ${tileHead}`}
        >
          {row.month}
        </div>
        <div className="flex-1 text-[18px] text-navy-600 font-semibold flex items-center justify-center leading-none">
          {row.day}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-1">
          <Icon name={row.glyph} className="text-[14px] text-slate-400" />
          <span className="text-navy-600 text-[13px] font-semibold truncate max-w-[16ch] ml-1">
            {row.payee}
          </span>
          <span className="text-slate-400 text-[13px] italic truncate ml-1">
            {row.narration}
          </span>
          {row.pill && <Pill kind={row.pill.kind} label={row.pill.label} />}
        </div>
        <div className="text-[11px] text-slate-400 truncate font-mono">
          {row.account}
        </div>
      </div>
      <div className="w-[92px] text-right shrink-0 font-mono flex flex-col justify-center border-l border-slate-100 pl-2">
        <div className="text-[11px]">
          {row.rewards.old && (
            <>
              <span className="text-slate-300 line-through">{row.rewards.old}</span>{' '}
              <span className="text-slate-300">→</span>{' '}
              <span className="text-sky-600 font-medium">{row.rewards.current}</span>
            </>
          )}
          {!row.rewards.old && (
            <span className="text-slate-600">{row.rewards.current}</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 font-mono flex flex-col justify-center w-[112px] ml-2">
        <div
          className={`text-[13px] font-medium ${
            row.amount.startsWith('-') ? 'text-error' : 'text-navy-600'
          }`}
        >
          {row.amount}
        </div>
      </div>
    </div>
  )
}

type TextLine = {
  n: number
  body: React.ReactNode
  indent?: boolean
  staged?: boolean
  gap?: 'bottom'
}

const textLines: TextLine[] = [
  { n: 118, body: <span className="text-slate-400">; oct 2023 — axis reserve</span> },
  { n: 119, body: <>&nbsp;</> },
  { n: 120, body: <span>2023-10-23 * &quot;Zepto&quot; &quot;Groceries&quot;</span> },
  { n: 121, body: <span>Liabilities:CreditCard:Axis     -320.00 INR</span>, indent: true },
  { n: 122, body: <span>Expenses:Groceries</span>, indent: true, gap: 'bottom' },
  { n: 123, body: <>&nbsp;</> },
  {
    n: 124,
    body: <span>2023-10-24 * &quot;Swiggy&quot; &quot;dinner with r&quot;</span>,
    staged: true,
  },
  {
    n: 125,
    body: <span>Liabilities:CreditCard:Axis     -640.00 INR</span>,
    indent: true,
    staged: true,
  },
  {
    n: 126,
    body: <span className="text-sky-700 font-medium">Expenses:Food:Delivery</span>,
    indent: true,
    staged: true,
  },
  { n: 127, body: <>&nbsp;</> },
  { n: 128, body: <span>2023-10-22 * &quot;Uber&quot; &quot;ride to office&quot;</span> },
  { n: 129, body: <span>Liabilities:CreditCard:Axis     -450.00 INR</span>, indent: true },
  { n: 130, body: <span>Expenses:Transport:Cab</span>, indent: true },
]

function TextLineRow({ line }: { line: TextLine }) {
  const gutter = line.staged ? 'text-sky-400' : 'text-slate-300'
  return (
    <div className={`flex ${line.gap === 'bottom' ? 'pb-3' : ''}`}>
      <div className={`w-8 shrink-0 ${gutter} text-right pr-3 select-none`}>{line.n}</div>
      <div className={`flex-1 text-navy-600 ${line.indent ? 'pl-4' : ''}`}>{line.body}</div>
    </div>
  )
}

function renderTextLines(lines: TextLine[]): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.staged) {
      const group: TextLine[] = []
      while (i < lines.length && lines[i].staged) {
        group.push(lines[i])
        i++
      }
      out.push(
        <div
          key={`g-${group[0].n}`}
          className="bg-sky-50/50 border-l-[2px] border-sky-400 -ml-4 pl-4 py-1 my-1"
        >
          {group.map((gl) => (
            <TextLineRow key={gl.n} line={gl} />
          ))}
        </div>,
      )
      continue
    }
    out.push(<TextLineRow key={line.n} line={line} />)
    i++
  }
  return out
}

export function LedgerNewView() {
  return (
    <div className="w-screen h-screen flex flex-col bg-scandi-bg text-navy-600 overflow-hidden font-sans">
      {/* Global header */}
      <header className="h-10 px-4 flex justify-between items-center bg-white shrink-0 z-20 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 bg-navy-600 rounded flex items-center justify-center text-white font-bold text-[10px] shadow-sm">
            MV
          </div>
          <div className="font-semibold text-navy-600 tracking-tight text-sm flex items-center gap-2">
            milesvault <span className="text-slate-300 font-normal">/</span> ledger
          </div>
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          <button className="hover:text-navy-600 transition-colors">
            <Icon name="search" className="text-[18px]" />
          </button>
          <button className="hover:text-navy-600 transition-colors">
            <Icon name="help" className="text-[18px]" />
          </button>
          <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">
            AK
          </div>
        </div>
      </header>

      {/* Ledger action bar */}
      <div className="h-14 px-4 flex justify-between items-center bg-white border-b border-slate-200 shrink-0 z-10">
        <div className="flex items-center">
          <button className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-navy-600 text-white text-xs font-medium shadow-sm hover:bg-navy-700 transition-colors">
            <Icon name="add" className="text-[14px]" />
            new
          </button>
          <div className="w-3" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
              merchant: swiggy
              <button className="ml-1 hover:text-navy-600">
                <Icon name="close" className="text-[14px]" />
              </button>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
              oct 2023
              <button className="ml-1 hover:text-navy-600">
                <Icon name="close" className="text-[14px]" />
              </button>
            </div>
            <button className="flex items-center gap-1 px-2 py-1 h-8 border border-dashed border-slate-300 rounded text-xs text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors">
              <Icon name="add" className="text-[14px]" /> filter
            </button>
            <div className="h-5 border-l border-slate-200 mx-2" />
            <button
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-50 text-slate-400 transition-colors"
              title="Undo"
            >
              <Icon name="undo" className="text-[18px]" />
            </button>
            <button
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-50 text-slate-400 transition-colors"
              title="Redo"
            >
              <Icon name="redo" className="text-[18px]" />
            </button>
            <div className="h-5 border-l border-slate-200 mx-2" />
          </div>
        </div>
        <div className="flex items-center">
          <button className="h-8 px-3 flex items-center justify-center rounded text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors">
            revert
          </button>
          <div className="w-2" />
          <button className="h-8 px-3 flex items-center justify-center rounded-md bg-navy-600 text-white text-xs font-medium hover:bg-navy-700 transition-colors shadow-sm gap-1">
            <div className="h-[6px] w-[6px] rounded-full bg-white/60" />
            save <Icon name="arrow_right" className="text-[14px]" />
          </button>
        </div>
      </div>

      {/* Three-pane body */}
      <main className="flex-1 flex gap-3 p-3 pb-0 overflow-hidden">
        {/* Cards pane */}
        <section className="flex-1 min-w-0 bg-white rounded-xl flex flex-col relative overflow-hidden border border-scandi-border">
          <div className="h-10 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
            <h2 className="text-navy-600 font-semibold text-[13px]">cards</h2>
            <h2 className="text-[11px] text-slate-400">12 shown</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 relative z-10 pb-10">
            {rows.map((row, i) => (
              <Card key={i} row={row} />
            ))}
          </div>
          <div className="absolute -bottom-6 -right-6 text-navy-600 opacity-[0.03] select-none pointer-events-none">
            <Icon name="account_balance_wallet" className="!text-[180px]" />
          </div>
          <div className="h-8 absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-100 flex items-center justify-between px-4 z-20">
            <span className="text-[11px] text-slate-400">showing 1–12 of 8,212</span>
            <button className="text-[11px] text-slate-400 hover:text-navy-600 transition-colors flex items-center gap-1">
              load older <Icon name="arrow_downward" className="text-[14px]" />
            </button>
          </div>
        </section>

        {/* Text pane */}
        <section className="flex-1 min-w-0 bg-white rounded-xl flex flex-col border border-scandi-border overflow-hidden relative">
          <div className="h-10 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
            <h2 className="text-[13px] font-semibold text-navy-600">text</h2>
            <button className="flex items-center gap-1 text-slate-400 hover:text-navy-600 transition-colors text-[11px]">
              <Icon name="content_copy" className="text-[14px]" /> copy
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-white text-[11px] font-mono leading-relaxed">
            <div className="p-4">{renderTextLines(textLines)}</div>
          </div>
        </section>

        {/* Diff + AI chat pane */}
        <section className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Diff */}
          <div className="h-[280px] bg-white rounded-xl flex flex-col border border-scandi-border overflow-hidden shrink-0">
            <div className="h-10 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
              <h2 className="text-navy-600 font-semibold text-[13px]">diff</h2>
              <div className="flex items-center gap-1 text-slate-300">
                <button className="hover:text-navy-600 transition-colors">
                  <Icon name="arrow_upward" className="text-[16px]" />
                </button>
                <button className="hover:text-navy-600 transition-colors">
                  <Icon name="arrow_downward" className="text-[16px]" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-[11px] font-mono">
              <div className="mb-4">
                <div className="text-slate-400 mb-1 text-[10px] uppercase">
                  @@ swiggy · dinner with r @@
                </div>
                <div className="bg-error/5 text-navy-600 flex px-2 py-0.5">
                  <span className="text-error w-4 shrink-0 select-none">-</span>
                  <span>Expenses:Uncategorized</span>
                </div>
                <div className="bg-sky-50 text-navy-600 flex px-2 py-0.5">
                  <span className="text-sky-600 w-4 shrink-0 select-none">+</span>
                  <span>Expenses:Food:Delivery</span>
                </div>
              </div>
              <div className="mb-4">
                <div className="text-slate-400 mb-1 text-[10px] uppercase">
                  @@ meat masterz · weekend order @@
                </div>
                <div className="bg-error/5 text-navy-600 flex px-2 py-0.5">
                  <span className="text-error w-4 shrink-0 select-none">-</span>
                  <span>Expenses:Uncategorized</span>
                </div>
                <div className="bg-sky-50 text-navy-600 flex px-2 py-0.5">
                  <span className="text-sky-600 w-4 shrink-0 select-none">+</span>
                  <span>Expenses:Food:Delivery</span>
                </div>
              </div>
              <div>
                <div className="text-slate-400 mb-1 text-[10px] uppercase">
                  @@ amazon · monitor & cables @@
                </div>
                <div className="bg-error/5 text-navy-600 flex px-2 py-0.5">
                  <span className="text-error w-4 shrink-0 select-none">-</span>
                  <span>Expenses:Shopping                -4500.00 INR</span>
                </div>
                <div className="bg-sky-50 text-navy-600 flex px-2 py-0.5">
                  <span className="text-sky-600 w-4 shrink-0 select-none">+</span>
                  <span>Expenses:Electronics:Monitor    -3200.00 INR</span>
                </div>
                <div className="bg-sky-50 text-navy-600 flex px-2 py-0.5">
                  <span className="text-sky-600 w-4 shrink-0 select-none">+</span>
                  <span>Expenses:Electronics:Accessory  -1300.00 INR</span>
                </div>
              </div>
            </div>
          </div>

          {/* AI chat */}
          <div className="flex-1 bg-white rounded-xl flex flex-col border border-scandi-border overflow-hidden">
            <div className="h-10 px-4 flex items-center border-b border-slate-100 shrink-0 gap-2">
              <Icon name="auto_awesome" className="text-[14px] text-sky-600" />
              <h2 className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">
                ai · scribe
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-sm">
              <div className="flex flex-col items-end gap-1">
                <div className="bg-slate-100 text-navy-600 px-3 py-2 rounded-xl rounded-tr-sm max-w-[85%] text-xs shadow-sm">
                  Recategorize Swiggy and Meat Masterz to expenses:food:delivery. Split the
                  Amazon purchase into monitor and accessories.
                </div>
              </div>
              <div className="flex flex-col items-start gap-1">
                <div className="bg-white text-navy-600 px-3 py-2 rounded-xl rounded-tl-sm max-w-[85%] text-xs shadow-sm border border-slate-100">
                  Done. I&apos;ve staged those changes to the ledger.
                </div>
                <div className="mt-1 bg-white border border-sky-100 p-2 rounded-md flex flex-col gap-2 w-[240px] shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-medium text-navy-600">
                    <Icon name="auto_awesome" className="text-[14px] text-sky-600" />3 proposals
                  </div>
                  <button className="w-full bg-navy-600 text-white text-xs font-medium py-1.5 rounded hover:bg-navy-700 transition-colors flex justify-center items-center gap-1">
                    approve all <Icon name="arrow_right" className="text-[14px]" />
                  </button>
                  <div className="flex justify-between text-[10px] text-slate-400 px-1">
                    <button className="hover:text-navy-600">reject all</button>
                    <button className="hover:text-navy-600">show diff</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-3 border-t border-slate-100 shrink-0 bg-white">
              <div className="bg-slate-50 rounded-lg flex items-center px-3 h-10 border border-slate-200 focus-within:border-sky-300 transition-colors">
                <button className="text-slate-400 hover:text-slate-600 mr-2">
                  <Icon name="attachment" className="text-[18px]" />
                </button>
                <input
                  className="bg-transparent border-none focus:ring-0 focus:outline-none text-xs w-full text-navy-600 placeholder:text-slate-400"
                  placeholder="ask scribe anything..."
                  type="text"
                />
                <button className="text-slate-400 hover:text-slate-600 mx-2">
                  <Icon name="mic" className="text-[18px]" />
                </button>
                <button className="bg-navy-600 text-white rounded-md w-8 h-8 flex items-center justify-center hover:bg-navy-700 transition-colors shrink-0 shadow-sm">
                  <Icon name="arrow_upward" className="text-[16px]" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Status line */}
      <div className="h-5 bg-slate-100 flex items-center justify-center text-[11px] text-slate-400 shrink-0 border-t border-slate-200/50">
        last saved · 2 hours ago · sep statement reconcile
      </div>
    </div>
  )
}
