import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React from 'react'
import { NotebookShell } from '../notebook-shell'
import { InvestmentsDashboard } from './investments-dashboard'
import type { OverviewViewProps } from '../overview-view'

const meta: Meta = { title: 'Ledger / Investments Dashboard', parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } } }
export default meta

const SAMPLE: OverviewViewProps = {
  kpis: [],
  trend: {
    title: 'Invested capital over time',
    currency: 'INR',
    highlightIndex: 11,
    points: [
      { x: 'May 25', y: 8_50_000, label: 'May 25 · ₹8,50,000.00' },
      { x: 'Jun', y: 9_25_000, label: 'Jun 25 · ₹9,25,000.00' },
      { x: 'Jul', y: 9_60_000, label: 'Jul 25 · ₹9,60,000.00' },
      { x: 'Aug', y: 10_15_000, label: 'Aug 25 · ₹10,15,000.00' },
      { x: 'Sep', y: 10_45_000, label: 'Sep 25 · ₹10,45,000.00' },
      { x: 'Oct', y: 11_20_000, label: 'Oct 25 · ₹11,20,000.00' },
      { x: 'Nov', y: 11_80_000, label: 'Nov 25 · ₹11,80,000.00' },
      { x: 'Dec', y: 12_45_000, label: 'Dec 25 · ₹12,45,000.00' },
      { x: 'Jan 26', y: 13_00_000, label: 'Jan 26 · ₹13,00,000.00' },
      { x: 'Feb', y: 13_60_000, label: 'Feb 26 · ₹13,60,000.00' },
      { x: 'Mar', y: 14_20_000, label: 'Mar 26 · ₹14,20,000.00' },
      { x: 'Apr', y: 14_80_000, label: 'Apr 26 · ₹14,80,000.00' },
    ],
  },
  composition: {
    title: 'Top counter-accounts',
    moreCount: 2,
    rows: [
      { prefix: 'Assets:Bank:HDFC:', leaf: 'Savings', amount: '−₹5,80,000.00', amountClass: 'text-rose-600', scale: 1.0 },
      { prefix: 'Income:', leaf: 'Dividend', amount: '−₹48,400.00', amountClass: 'text-rose-600', scale: 0.083 },
      { prefix: 'Assets:Bank:ICICI:', leaf: 'Salary', amount: '−₹40,000.00', amountClass: 'text-rose-600', scale: 0.069 },
      { prefix: 'Income:', leaf: 'Interest', amount: '−₹12,200.00', amountClass: 'text-rose-600', scale: 0.021 },
    ],
  },
  events: {
    title: 'Notable transactions',
    rows: [
      { date: '2026-04-15', payee: 'Zerodha', narration: 'NIFTY 50 ETF — accumulation', amount: '+₹60,000.00', amountClass: 'text-slate-900' },
      { date: '2026-03-31', payee: 'Zerodha', narration: 'Q4 dividends reinvested', amount: '+₹18,400.00', amountClass: 'text-slate-900' },
      { date: '2026-03-15', payee: 'Zerodha', narration: 'INFY shares purchase', amount: '+₹50,000.00', amountClass: 'text-slate-900' },
      { date: '2026-02-28', payee: 'Zerodha', narration: 'NIFTY 50 ETF — accumulation', amount: '+₹60,000.00', amountClass: 'text-slate-900' },
      { date: '2026-01-31', payee: 'Zerodha', narration: 'Bond ladder rung', amount: '+₹50,000.00', amountClass: 'text-slate-900' },
    ],
  },
  headerStats: { balance: '₹14,80,000.00' },
}

export const Default: StoryObj = {
  render: () => (
    <NotebookShell
      breadcrumb={['Assets', 'Investments']}
      accountTitle="Investments"
      accountPath="Assets:Investments"
      cards={[]}
      txnCount={42}
      currency="INR"
      defaultViewMode="overview"
      overviewBody={<InvestmentsDashboard {...SAMPLE} />}
    />
  ),
}
