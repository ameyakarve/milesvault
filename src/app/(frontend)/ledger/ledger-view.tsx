import React from 'react'

type ProseTxn = {
  kind: 'prose'
  id: string
  date: string
  body: string
}

type RecessedTxn = {
  kind: 'recessed'
  id: string
  date: string
  payee: string
  narration: string
  amount: string | { line1: string; line2: string }
  postings: Array<{ account: string; amount: string }>
}

type Txn = ProseTxn | RecessedTxn

const TXNS: Txn[] = [
  {
    kind: 'prose',
    id: '1',
    date: '2026-04-16',
    body: 'Morning coffee at Blue Tokai — paid using HDFC Infinia — ₹220',
  },
  {
    kind: 'recessed',
    id: '2',
    date: '2026-04-15',
    payee: 'BigBasket',
    narration: 'groceries',
    amount: '₹500.00',
    postings: [
      { account: 'Assets:Bank:HDFC:Savings', amount: '-500.00 INR' },
      { account: 'Assets:DebitCards:HDFC:1234', amount: '500.00 INR' },
      { account: 'Assets:DebitCards:HDFC:1234', amount: '-500.00 INR' },
      { account: 'Expenses:Food:Groceries', amount: '500.00 INR' },
    ],
  },
  {
    kind: 'prose',
    id: '3',
    date: '2026-04-14',
    body: 'Dinner at Zomato — paid using HDFC Infinia — ₹1,000 · 10% cashback ₹100',
  },
  {
    kind: 'recessed',
    id: '4',
    date: '2026-04-10',
    payee: 'British Airways',
    narration: 'LHR-BOM flight',
    amount: '45,000 AVIOS',
    postings: [
      { account: 'Assets:Rewards:Points:Avios', amount: '-45000.00 AVIOS' },
      { account: 'Expenses:Travel:Flights', amount: '45000.00 AVIOS' },
    ],
  },
  {
    kind: 'prose',
    id: '5',
    date: '2026-04-11',
    body: 'Breakfast at Café de Flore — paid from HDFC Forex — $50',
  },
  {
    kind: 'recessed',
    id: '6',
    date: '2026-04-08',
    payee: 'Marriott Bonvoy',
    narration: 'Mumbai stay',
    amount: '3 NIGHTS',
    postings: [
      { account: 'Assets:Rewards:Points:Marriott', amount: '-45000.00 MARRIOTT-PTS' },
      { account: 'Expenses:Travel:Hotels', amount: '45000.00 MARRIOTT-PTS' },
      { account: 'Assets:Rewards:Status:Marriott', amount: '3.00 MAR-NIGHTS' },
      { account: 'Income:Rewards', amount: '-3.00 MAR-NIGHTS' },
    ],
  },
  {
    kind: 'prose',
    id: '7',
    date: '2026-04-09',
    body: 'Loaded Paytm Wallet from HDFC Savings — ₹1,000',
  },
  {
    kind: 'prose',
    id: '8',
    date: '2026-04-08',
    body: 'Dinner at Zomato — paid using HDFC Infinia — ₹850 (₹150 promo)',
  },
  {
    kind: 'recessed',
    id: '9',
    date: '2026-04-03',
    payee: 'HDFC SmartBuy',
    narration: 'transfer to Avios',
    amount: { line1: '-10,000 SMARTBUY', line2: '+10,000 AVIOS' },
    postings: [
      { account: 'Assets:Rewards:Points:SmartBuy', amount: '-10000.00 SMARTBUY @@ 10000.00 AVIOS' },
      { account: 'Assets:Rewards:Points:Avios', amount: '10000.00 AVIOS' },
    ],
  },
  {
    kind: 'prose',
    id: '10',
    date: '2026-04-06',
    body: 'Auto ride with Uber — paid from Paytm Wallet — ₹85',
  },
]

export function LedgerView() {
  return (
    <div className="min-h-screen bg-[#F7F3EC] text-[#0F1B2E]">
      <TopNav />
      <main className="flex w-full max-w-[2560px] mx-auto" style={{ height: 'calc(100vh - 64px)' }}>
        <LedgerPane />
        <AssistantPane />
      </main>
    </div>
  )
}

function TopNav() {
  return (
    <nav className="sticky top-0 z-50 flex justify-between items-center px-8 h-16 w-full bg-[#F7F3EC]">
      <div className="flex items-center gap-8">
        <span className="font-serif text-2xl font-black text-[#0A2540]">MilesVault</span>
        <div className="hidden md:flex gap-6 items-center pt-1 font-serif text-lg tracking-tight font-medium">
          <a className="text-[#6B7889] font-normal hover:text-[#0A2540] transition-colors" href="#">
            Home
          </a>
          <a className="text-[#6B7889] font-normal hover:text-[#0A2540] transition-colors" href="#">
            Accounts
          </a>
          <a className="text-[#6B7889] font-normal hover:text-[#0A2540] transition-colors" href="#">
            Reports
          </a>
          <a className="text-[#0A2540] border-b-2 border-[#0A2540] pb-1" href="#">
            Ledger
          </a>
          <a className="text-[#6B7889] font-normal hover:text-[#0A2540] transition-colors" href="#">
            Cards
          </a>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[#0A2540]">
        <span className="material-symbols-outlined cursor-pointer hover:opacity-70">settings</span>
        <span className="material-symbols-outlined cursor-pointer hover:opacity-70">account_circle</span>
      </div>
    </nav>
  )
}

function LedgerPane() {
  return (
    <section className="w-[62%] h-full overflow-y-auto px-12 py-8 flex flex-col gap-6">
      <LedgerHeader />
      <SearchBar />
      <LedgerStream />
    </section>
  )
}

function LedgerHeader() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex bg-[#F1EDE6] rounded-full p-1 border border-black/10">
        <button className="px-4 py-1.5 rounded-full bg-white text-ink text-sm font-semibold shadow-sm">
          Cards
        </button>
        <button className="px-4 py-1.5 rounded-full text-muted text-sm font-medium hover:text-ink">
          Text
        </button>
      </div>
      <span className="text-[13px] text-muted font-medium">Showing 10 of 234</span>
    </div>
  )
}

function SearchBar() {
  return (
    <div className="relative w-full flex items-center bg-white border border-black/10 rounded-full p-2 pl-4">
      <div className="flex items-center gap-2 bg-[#F1EDE6] px-2 py-1 rounded text-[11px] font-mono text-ink">
        <span>2026-04</span>
        <span className="material-symbols-outlined !text-[14px] cursor-pointer hover:text-[#ba1a1a]">
          close
        </span>
      </div>
      <input
        type="text"
        placeholder="@account #tag ^link >2026-03-01 2026-03-01..2026-04-01"
        className="w-full bg-transparent border-none py-2 pl-4 pr-4 font-mono text-sm text-ink placeholder-muted focus:outline-none focus:ring-0"
      />
    </div>
  )
}

function LedgerStream() {
  return (
    <div className="flex flex-col gap-4 pb-24">
      {TXNS.map((txn) =>
        txn.kind === 'prose' ? (
          <ProseTxnCard key={txn.id} txn={txn} />
        ) : (
          <RecessedTxnCard key={txn.id} txn={txn} />
        ),
      )}
      <div className="text-center pt-8">
        <span className="font-serif italic text-muted text-sm">— end · 10 of 234 —</span>
      </div>
    </div>
  )
}

function ProseTxnCard({ txn }: { txn: ProseTxn }) {
  return (
    <article className="relative bg-white rounded-full p-4 pl-6 pr-4 border border-black/10 flex items-center transition-colors hover:bg-black/5">
      <span className="font-mono text-[10px] text-muted tracking-wide w-24 shrink-0">{txn.date}</span>
      <p className="font-serif text-[15px] text-ink flex-1">{txn.body}</p>
      <div className="absolute right-4 top-0 h-full flex items-center gap-2 text-[#9B8B7A]">
        <span className="material-symbols-outlined !text-[16px] cursor-pointer hover:text-ink">edit</span>
        <span className="material-symbols-outlined !text-[16px] cursor-pointer hover:text-[#ba1a1a]">
          delete
        </span>
      </div>
    </article>
  )
}

function RecessedTxnCard({ txn }: { txn: RecessedTxn }) {
  const isStacked = typeof txn.amount !== 'string'
  return (
    <article className="bg-white rounded-[12px] p-6 border border-black/10 flex flex-col gap-4 transition-colors hover:bg-black/5">
      <header className="flex items-center relative">
        <span className="font-mono text-[10px] text-muted tracking-wide w-24 shrink-0">{txn.date}</span>
        <h3 className="font-serif text-lg font-semibold text-ink flex-1">{txn.payee}</h3>
        <div className="absolute top-0 right-0 flex items-start gap-6">
          {isStacked ? (
            <div className="flex flex-col items-end">
              <span className="font-mono text-[14px] font-medium text-[#0A2540]">
                {(txn.amount as { line1: string; line2: string }).line1}
              </span>
              <span className="font-mono text-[14px] font-medium text-[#0A2540]">
                {(txn.amount as { line1: string; line2: string }).line2}
              </span>
            </div>
          ) : (
            <span className="font-mono text-[20px] font-medium text-[#0A2540]">{txn.amount as string}</span>
          )}
          <div className={`flex gap-2 text-[#9B8B7A] ${isStacked ? 'self-start mt-1' : ''}`}>
            <span className="material-symbols-outlined !text-[16px] cursor-pointer hover:text-ink">edit</span>
            <span className="material-symbols-outlined !text-[16px] cursor-pointer hover:text-[#ba1a1a]">
              delete
            </span>
          </div>
        </div>
      </header>
      <div className="relative bg-[#F2EDE3] border border-[#E5DDD0] rounded-[10px] p-4 pl-5 flex flex-col gap-2 overflow-hidden">
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#B8642F]" />
        <div className="font-mono text-[12px] text-muted mb-1">
          {txn.date} * &quot;{txn.payee}&quot; &quot;{txn.narration}&quot;
        </div>
        {txn.postings.map((p, i) => (
          <div key={i} className="flex justify-between font-mono text-[12px] text-[#2A2520]">
            <span className="text-[#4A4238]">{p.account}</span>
            <span>{p.amount}</span>
          </div>
        ))}
      </div>
    </article>
  )
}

function AssistantPane() {
  return (
    <aside className="w-[38%] h-full bg-[#F1EDE6] border-l border-black/10 flex flex-col relative">
      <header className="h-20 px-8 flex items-center justify-between border-b border-black/10 bg-[#F1EDE6]">
        <h2 className="font-serif text-lg text-ink font-semibold">Assistant</h2>
        <span className="font-mono text-[10px] text-muted uppercase tracking-wider">CLERK · ALWAYS ON</span>
      </header>
      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-10 pb-32">
        <UserTurn body="what did i spend on travel in Q1?" />
        <ClerkAnswer
          intro="You've spent ₹1,24,300 across 9 transactions in Q1 2026."
          tableCaption="TRAVEL · Q1 2026 · 9 TRANSACTIONS"
          rows={[
            ['Flights', '₹88,200.00'],
            ['Hotels', '₹24,300.00'],
            ['Transit', '₹11,800.00'],
          ]}
          sources="SOURCES · LEDGER.BEANCOUNT"
        />
        <ClerkMarginalia body="Forex card underused — only ₹18,400 loaded across three trips this quarter, against a ₹2L annual zero-markup ceiling. Consider shifting Amazon US spend off Infinia." />
        <UserTurn body="log dinner at amudham 400 on infinia" />
        <ClerkDraft
          confirmation="I'll file this under Food · Restaurant"
          preview="Dinner at Amudham — paid using HDFC Infinia — ₹400"
        />
      </div>
      <Composer />
    </aside>
  )
}

function UserTurn({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="inline-block w-1 h-3 bg-[#B8642F]" />
        <span className="font-mono text-[10px] text-[#B8642F] uppercase tracking-wider font-semibold">
          YOU ·
        </span>
      </div>
      <p className="text-[14px] text-[#0F1B2E] leading-relaxed">{body}</p>
    </div>
  )
}

function ClerkAnswer({
  intro,
  tableCaption,
  rows,
  sources,
}: {
  intro: string
  tableCaption: string
  rows: Array<[string, string]>
  sources: string
}) {
  return (
    <div className="flex flex-col gap-2 pl-5 border-l-2 border-black/15">
      <span className="font-mono text-[10px] text-[#9B8B7A] uppercase tracking-wider font-semibold">
        CLERK ·
      </span>
      <p className="text-[14px] text-[#3C3632] leading-relaxed">{intro}</p>
      <div className="font-mono text-[10px] text-muted uppercase tracking-wider font-semibold mt-3">
        {tableCaption}
      </div>
      <div className="flex flex-col">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between items-center py-2 border-b border-black/10"
          >
            <span className="font-serif text-[15px] text-ink">{label}</span>
            <span className="font-mono text-sm">{value}</span>
          </div>
        ))}
      </div>
      <div className="font-mono text-[10px] text-muted uppercase tracking-wider mt-2">{sources}</div>
    </div>
  )
}

function ClerkMarginalia({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-2 pl-5 border-l-2 border-black/15">
      <span className="font-mono text-[10px] text-[#9B8B7A] uppercase tracking-wider font-semibold">
        CLERK ·
      </span>
      <p className="font-serif italic text-[14px] text-[#3C3632] leading-relaxed">
        <span className="text-[#B8642F] not-italic mr-1">†</span>
        {body}
      </p>
      <div className="flex gap-3 mt-1">
        <a className="text-xs text-muted hover:text-ink underline underline-offset-2" href="#">
          view
        </a>
        <a className="text-xs text-muted hover:text-ink underline underline-offset-2" href="#">
          dismiss
        </a>
      </div>
    </div>
  )
}

function ClerkDraft({ confirmation, preview }: { confirmation: string; preview: string }) {
  return (
    <div className="flex flex-col gap-3 pl-5 border-l-2 border-black/15">
      <span className="font-mono text-[10px] text-[#9B8B7A] uppercase tracking-wider font-semibold">
        CLERK ·
      </span>
      <p className="text-[14px] text-[#3C3632] leading-relaxed">{confirmation}</p>
      <div className="bg-[#F2EDE3] border border-[#E5DDD0] rounded-full py-3 px-6">
        <p className="font-serif text-[14px] text-ink">{preview}</p>
      </div>
      <div className="flex gap-6 mt-1">
        <DraftAction icon="check_circle" label="ACCEPT" color="#B8642F" filled />
        <DraftAction icon="edit" label="EDIT" color="#4A4238" />
        <DraftAction icon="close" label="DISMISS" color="#9B8B7A" />
      </div>
    </div>
  )
}

function DraftAction({
  icon,
  label,
  color,
  filled,
}: {
  icon: string
  label: string
  color: string
  filled?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1 cursor-pointer group">
      <span
        className="material-symbols-outlined !text-[20px] group-hover:opacity-80"
        style={{
          color,
          fontVariationSettings: filled
            ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20"
            : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20",
        }}
      >
        {icon}
      </span>
      <span className="font-mono text-[9px] text-muted">{label}</span>
    </div>
  )
}

function Composer() {
  return (
    <div className="absolute bottom-0 left-0 right-0 px-8 py-6 bg-[#F1EDE6]">
      <div className="flex items-center gap-3 border-b border-black/20 pb-2">
        <span className="text-[#B8642F] font-mono text-[14px] font-semibold">›</span>
        <input
          type="text"
          placeholder="ask, or draft a new transaction…"
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-serif placeholder-muted px-0 py-1"
        />
        <span className="font-mono text-[10px] text-muted shrink-0">⏎ to send</span>
      </div>
    </div>
  )
}
