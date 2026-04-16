import { headers as getHeaders } from 'next/headers.js'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'

export default async function HomePage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect('/admin/login?redirect=/home')
  }

  return (
    <>
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#FBFCFD] border-b border-[#E4E8ED] h-[56px] flex justify-between items-center w-full px-6 max-w-full">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold tracking-[-0.01em] text-ink">MilesVault</span>
          <nav className="hidden md:flex gap-6 items-center h-full">
            <a className="text-ink font-semibold text-[0.85rem]" href="#">Home</a>
            <a className="text-muted font-medium text-[0.85rem] hover:text-ink transition-colors" href="#">Accounts</a>
            <a className="text-muted font-medium text-[0.85rem] hover:text-ink transition-colors" href="#">Reports</a>
            <a className="text-muted font-medium text-[0.85rem] hover:text-ink transition-colors" href="#">Transactions</a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="data-mono text-[0.8rem] text-muted">16 Apr 2026</span>
          <div className="w-7 h-7 rounded-full bg-slate-bg flex items-center justify-center">
            <span className="text-[10px] font-semibold text-ink">AK</span>
          </div>
        </div>
      </header>

      <main className="max-w-[960px] mx-auto px-6 py-10 space-y-10">
        {/* Composer Section */}
        <section className="bg-hover-row border border-[#E4E8ED] rounded-lg p-3">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-ink opacity-50 !text-[16px]">mic</span>
            <input
              className="w-full bg-transparent border-none focus:ring-2 focus:ring-primary rounded p-0 placeholder-muted text-ink text-sm font-medium"
              placeholder="Record a spend, or ask about your ledger…"
              type="text"
            />
            <span className="material-symbols-outlined text-ink opacity-50 !text-[16px]">send</span>
          </div>
        </section>

        {/* Status Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Spend Card */}
          <div className="bg-slate-bg p-6 rounded-lg flex flex-col justify-between">
            <div>
              <h3 className="text-[11px] uppercase tracking-widest text-muted mb-4 font-bold">SPEND · APRIL</h3>
              <div className="data-mono text-[2.5rem] font-medium text-ink leading-tight">−₹2,40,000</div>
              <div className="mt-2 flex items-center gap-1.5 text-[0.8rem] text-muted">
                <span>+ <span className="data-mono text-ink">$1,200</span></span>
                <span>·</span>
                <span>8% under March pace</span>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-6">
              {/* Donut 1: BY CATEGORY */}
              <div className="space-y-3">
                <div className="text-[9px] data-mono font-bold text-muted uppercase tracking-wider">BY CATEGORY</div>
                <div className="flex flex-col gap-4">
                  <div className="w-16 h-16 relative">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="white" strokeWidth="6" />
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="#0A2540" strokeDasharray="26.15 100" strokeDashoffset="0" strokeWidth="6" />
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="#3B5B7A" strokeDasharray="17.35 100" strokeDashoffset="-28.15" strokeWidth="6" />
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="#2F6B6E" strokeDasharray="12.07 100" strokeDashoffset="-47.5" strokeWidth="6" />
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="#8B5A7C" strokeDasharray="9.43 100" strokeDashoffset="-61.57" strokeWidth="6" />
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="#4F6B4A" strokeDasharray="5.91 100" strokeDashoffset="-73" strokeWidth="6" />
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="#C9914A" strokeDasharray="5.04 100" strokeDashoffset="-80.91" strokeWidth="6" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted normal-case" style={{ textTransform: 'none' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0A2540]"></span>Food &amp; Groceries · <span className="data-mono text-ink">32%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted normal-case" style={{ textTransform: 'none' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3B5B7A]"></span>Travel · <span className="data-mono text-ink">22%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted normal-case" style={{ textTransform: 'none' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2F6B6E]"></span>Bills · <span className="data-mono text-ink">16%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted normal-case" style={{ textTransform: 'none' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8B5A7C]"></span>Shopping · <span className="data-mono text-ink">12%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted normal-case" style={{ textTransform: 'none' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4F6B4A]"></span>Tech &amp; Services · <span className="data-mono text-ink">9%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted normal-case" style={{ textTransform: 'none' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C9914A]"></span>Other · <span className="data-mono text-ink">9%</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Donut 2: BY MODE */}
              <div className="space-y-3">
                <div className="text-[9px] data-mono font-bold text-muted uppercase tracking-wider">BY MODE</div>
                <div className="flex flex-col gap-4">
                  <div className="w-16 h-16 relative">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="white" strokeWidth="6" />
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="#0A2540" strokeDasharray="28.79 100" strokeDashoffset="0" strokeWidth="6" />
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="#3B5B7A" strokeDasharray="21.75 100" strokeDashoffset="-30.79" strokeWidth="6" />
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="#2F6B6E" strokeDasharray="17.35 100" strokeDashoffset="-54.54" strokeWidth="6" />
                      <circle cx="18" cy="18" fill="transparent" r="14" stroke="#8B5A7C" strokeDasharray="12.07 100" strokeDashoffset="-73.89" strokeWidth="6" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted normal-case" style={{ textTransform: 'none' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0A2540]"></span>HDFC Infinia · <span className="data-mono text-ink">35%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted normal-case" style={{ textTransform: 'none' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3B5B7A]"></span>UPI / Bank · <span className="data-mono text-ink">27%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted normal-case" style={{ textTransform: 'none' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2F6B6E]"></span>Diners Black · <span className="data-mono text-ink">22%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted normal-case" style={{ textTransform: 'none' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8B5A7C]"></span>Amex Platinum Travel · <span className="data-mono text-ink">16%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rewards Card */}
          <div className="bg-mint-bg p-6 rounded-lg flex flex-col">
            <h3 className="text-[11px] uppercase tracking-widest text-muted mb-6 font-bold">REWARDS EARNED · APRIL</h3>
            <div className="space-y-4 flex-grow">
              <div className="flex justify-between items-baseline border-b border-[#E4E8ED] pb-3">
                <span className="text-[0.85rem] font-medium text-muted">Avios</span>
                <span className="data-mono text-xl font-medium text-ink">+12,000</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-[#E4E8ED] pb-3">
                <span className="text-[0.85rem] font-medium text-muted">HDFC-RP</span>
                <span className="data-mono text-xl font-medium text-ink">+9,490</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-[#E4E8ED] pb-3">
                <span className="text-[0.85rem] font-medium text-muted">MR</span>
                <span className="data-mono text-xl font-medium text-ink">+5,410</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-[#E4E8ED] pb-3">
                <span className="text-[0.85rem] font-medium text-muted">UR</span>
                <span className="data-mono text-xl font-medium text-ink">+880</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cards & Insights Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Credit Cards Section */}
          <div className="bg-plum-bg rounded-lg p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-[0.95rem] font-semibold text-ink">Credit Cards</h3>
              <div className="flex gap-4">
                <button className="text-[0.8rem] text-muted hover:text-primary transition-colors">+ Add card</button>
                <a className="text-[0.8rem] text-muted hover:text-primary transition-colors" href="#">View all →</a>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[10px] data-mono uppercase tracking-widest text-muted">
                  <tr className="border-b border-[#D8CFD4]">
                    <th className="py-2 font-normal">CARD</th>
                    <th className="py-2 font-normal">CURRENCY</th>
                    <th className="py-2 font-normal text-right">SPEND</th>
                    <th className="py-2 font-normal text-right">EARNED</th>
                  </tr>
                </thead>
                <tbody className="data-mono text-[11px]">
                  <tr className="hover:bg-[#E3DAE0] transition-colors">
                    <td className="py-3 font-sans font-medium text-ink">HDFC Infinia</td>
                    <td className="py-3 text-muted">INR</td>
                    <td className="py-3 text-right text-ink">−₹84,200</td>
                    <td className="py-3 text-right font-medium text-ink">+4,210 HDFC-RP</td>
                  </tr>
                  <tr className="hover:bg-[#E3DAE0] transition-colors">
                    <td className="py-3 font-sans font-medium text-ink">Diners Club Black</td>
                    <td className="py-3 text-muted">INR</td>
                    <td className="py-3 text-right text-ink">−₹52,800</td>
                    <td className="py-3 text-right font-medium text-ink">+5,280 HDFC-RP</td>
                  </tr>
                  <tr className="hover:bg-[#E3DAE0] transition-colors">
                    <td className="py-3 font-sans font-medium text-ink">Amex Platinum Travel</td>
                    <td className="py-3 text-muted">INR</td>
                    <td className="py-3 text-right text-ink">−₹38,400</td>
                    <td className="py-3 text-right font-medium text-ink">+1,920 MR</td>
                  </tr>
                  <tr className="hover:bg-[#E3DAE0] transition-colors">
                    <td className="py-3 font-sans font-medium text-ink">Chase Sapphire</td>
                    <td className="py-3 text-muted">USD</td>
                    <td className="py-3 text-right text-ink">−$1,200</td>
                    <td className="py-3 text-right font-medium text-ink">+880 UR</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Insights Section */}
          <div className="bg-saffron-bg rounded-lg p-6 space-y-4">
            <h3 className="text-[0.95rem] font-semibold text-ink">Insights</h3>
            <div className="space-y-4">
              <div className="group">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-ink opacity-40 mt-0.5 !text-[14px]">circle</span>
                  <div>
                    <h4 className="text-[0.85rem] font-semibold text-ink leading-tight">Groceries up 18% vs March</h4>
                    <p className="text-[0.8rem] text-muted leading-relaxed mt-1">
                      Across 7 transactions · <span className="data-mono">₹14,200</span> this month vs <span className="data-mono">₹12,030</span> last month
                    </p>
                    <a className="inline-block mt-2 text-[0.8rem] text-muted hover:text-primary transition-colors uppercase tracking-wider font-semibold" href="#">SEE BREAKDOWN →</a>
                  </div>
                </div>
              </div>
              <div className="group">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-ink opacity-40 mt-0.5 !text-[14px]">circle</span>
                  <div>
                    <h4 className="text-[0.85rem] font-semibold text-ink leading-tight">New recurring detected — Spotify</h4>
                    <p className="text-[0.8rem] text-muted leading-relaxed mt-1">
                      <span className="data-mono">₹119</span> charged on the 14th, three months running. Add to subscriptions?
                    </p>
                    <a className="inline-block mt-2 text-[0.8rem] text-muted hover:text-primary transition-colors uppercase tracking-wider font-semibold" href="#">TRACK →</a>
                  </div>
                </div>
              </div>
              <div className="group">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-ink opacity-40 mt-0.5 !text-[14px]">circle</span>
                  <div>
                    <h4 className="text-[0.85rem] font-semibold text-ink leading-tight">Card pattern shift</h4>
                    <p className="text-[0.8rem] text-muted leading-relaxed mt-1">
                      Last 2 grocery transactions went to Diners Black. You usually charge groceries to HDFC Infinia. Intentional?
                    </p>
                    <a className="inline-block mt-2 text-[0.8rem] text-muted hover:text-primary transition-colors uppercase tracking-wider font-semibold" href="#">SHOW TRANSACTIONS →</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <section className="space-y-4 pb-20">
          <div className="flex justify-between items-center">
            <h3 className="text-[0.95rem] font-semibold text-ink">Recent</h3>
            <a className="text-[0.8rem] text-muted hover:text-primary transition-colors" href="#">Open ledger →</a>
          </div>
          <div className="divide-y divide-[#EEF1F5]">
            <div className="hover:bg-hover-row transition-colors flex items-center gap-4 py-3">
              <div className="data-mono text-[10px] text-muted w-[110px] flex-shrink-0">Today 8:14 am</div>
              <div className="flex-1 flex flex-col min-w-0">
                <span className="text-[0.85rem] font-medium text-ink truncate">Blue Tokai — morning coffee</span>
              </div>
              <div className="px-2 py-0.5 bg-[#EEF2F7] rounded-[4px] text-[10px] text-muted font-medium whitespace-nowrap">HDFC Infinia</div>
              <div className="text-right flex flex-col min-w-[80px]">
                <span className="data-mono text-[0.85rem] font-medium text-ink">−₹220</span>
                <span className="data-mono text-[10px] text-muted">+11 HDFC-RP</span>
              </div>
            </div>
            <div className="hover:bg-hover-row transition-colors flex items-center gap-4 py-3">
              <div className="data-mono text-[10px] text-muted w-[110px] flex-shrink-0">Today 11:40 am</div>
              <div className="flex-1 flex flex-col min-w-0">
                <span className="text-[0.85rem] font-medium text-ink truncate">BigBasket — weekly groceries</span>
              </div>
              <div className="px-2 py-0.5 bg-[#EEF2F7] rounded-[4px] text-[10px] text-muted font-medium whitespace-nowrap">HDFC Infinia</div>
              <div className="text-right flex flex-col min-w-[80px]">
                <span className="data-mono text-[0.85rem] font-medium text-ink">−₹3,420</span>
                <span className="data-mono text-[10px] text-muted">+171 HDFC-RP</span>
              </div>
            </div>
            <div className="hover:bg-hover-row transition-colors flex items-center gap-4 py-3">
              <div className="data-mono text-[10px] text-muted w-[110px] flex-shrink-0">Today 2:05 pm</div>
              <div className="flex-1 flex flex-col min-w-0">
                <span className="text-[0.85rem] font-medium text-ink truncate">Indian Oil — fuel</span>
              </div>
              <div className="px-2 py-0.5 bg-[#EEF2F7] rounded-[4px] text-[10px] text-muted font-medium whitespace-nowrap">Diners Club Black</div>
              <div className="text-right flex flex-col min-w-[80px]">
                <span className="data-mono text-[0.85rem] font-medium text-ink">−₹2,800</span>
                <span className="data-mono text-[10px] text-muted">+280 HDFC-RP</span>
              </div>
            </div>
            <div className="hover:bg-hover-row transition-colors flex items-center gap-4 py-3">
              <div className="data-mono text-[10px] text-muted w-[110px] flex-shrink-0">Today 6:48 pm</div>
              <div className="flex-1 flex flex-col min-w-0">
                <span className="text-[0.85rem] font-medium text-ink truncate">Uber — airport drop</span>
              </div>
              <div className="px-2 py-0.5 bg-[#EEF2F7] rounded-[4px] text-[10px] text-muted font-medium whitespace-nowrap">Amex Platinum Travel</div>
              <div className="text-right flex flex-col min-w-[80px]">
                <span className="data-mono text-[0.85rem] font-medium text-ink">−₹420</span>
                <span className="data-mono text-[10px] text-muted">+21 MR</span>
              </div>
            </div>
            <div className="hover:bg-hover-row transition-colors flex items-center gap-4 py-3">
              <div className="data-mono text-[10px] text-muted w-[110px] flex-shrink-0">Yesterday 7:30 pm</div>
              <div className="flex-1 flex flex-col min-w-0">
                <span className="text-[0.85rem] font-medium text-ink truncate">Toast — dinner with friends</span>
              </div>
              <div className="px-2 py-0.5 bg-[#EEF2F7] rounded-[4px] text-[10px] text-muted font-medium whitespace-nowrap">Chase Sapphire</div>
              <div className="text-right flex flex-col min-w-[80px]">
                <span className="data-mono text-[0.85rem] font-medium text-ink">−$68.40</span>
                <span className="data-mono text-[10px] text-muted">+273 UR</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
