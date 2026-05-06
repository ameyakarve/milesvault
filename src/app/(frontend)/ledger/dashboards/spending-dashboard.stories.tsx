import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React from 'react'
import { NotebookShell } from '../notebook-shell'
import { SpendingDashboard } from './spending-dashboard'
import type { OverviewViewProps } from '../overview-view'

const meta: Meta = { title: 'Ledger / Spending Dashboard', parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } } }
export default meta

const SAMPLE: OverviewViewProps = {
  kpis: [],
  trend: {
    title: 'Cumulative spending',
    currency: 'INR',
    highlightIndex: 11,
    points: [
      { x: 'May 25', y: 32400, label: 'May 25 · ₹32,400.00' },
      { x: 'Jun', y: 78900, label: 'Jun 25 · ₹78,900.00' },
      { x: 'Jul', y: 1_24_500, label: 'Jul 25 · ₹1,24,500.00' },
      { x: 'Aug', y: 1_82_300, label: 'Aug 25 · ₹1,82,300.00' },
      { x: 'Sep', y: 2_45_100, label: 'Sep 25 · ₹2,45,100.00' },
      { x: 'Oct', y: 3_08_400, label: 'Oct 25 · ₹3,08,400.00' },
      { x: 'Nov', y: 3_72_600, label: 'Nov 25 · ₹3,72,600.00' },
      { x: 'Dec', y: 4_55_200, label: 'Dec 25 · ₹4,55,200.00' },
      { x: 'Jan 26', y: 5_18_700, label: 'Jan 26 · ₹5,18,700.00' },
      { x: 'Feb', y: 5_84_300, label: 'Feb 26 · ₹5,84,300.00' },
      { x: 'Mar', y: 6_52_400, label: 'Mar 26 · ₹6,52,400.00' },
      { x: 'Apr', y: 7_24_800, label: 'Apr 26 · ₹7,24,800.00' },
    ],
  },
  composition: {
    title: 'Top funding sources',
    moreCount: 0,
    rows: [
      { prefix: 'Assets:Bank:HDFC:', leaf: 'Savings', amount: '−₹4,82,400.00', amountClass: 'text-rose-600', scale: 1.0 },
      { prefix: 'Liabilities:CC:HDFC:', leaf: 'Infinia', amount: '−₹1,80,200.00', amountClass: 'text-rose-600', scale: 0.37 },
      { prefix: 'Liabilities:CC:Amex:', leaf: 'Platinum', amount: '−₹62,200.00', amountClass: 'text-rose-600', scale: 0.13 },
    ],
  },
  events: {
    title: 'Largest charges',
    rows: [
      { date: '2026-04-28', payee: 'Cathay Pacific', narration: 'BLR → HKG return', amount: '+₹48,200.00', amountClass: 'text-slate-900' },
      { date: '2026-04-15', payee: 'IKEA Bengaluru', narration: 'Bookshelves', amount: '+₹38,700.00', amountClass: 'text-slate-900' },
      { date: '2026-03-22', payee: 'Apple India', narration: 'iPhone 17 Pro', amount: '+₹1,28,900.00', amountClass: 'text-slate-900' },
      { date: '2026-03-08', payee: 'Indigo Airlines', narration: 'BLR → BOM', amount: '+₹14,300.00', amountClass: 'text-slate-900' },
      { date: '2026-02-19', payee: 'Royal Brothers', narration: 'Goa rentals', amount: '+₹22,800.00', amountClass: 'text-slate-900' },
    ],
  },
}

export const Default: StoryObj = {
  render: () => (
    <NotebookShell
      breadcrumb={['Expenses']}
      accountTitle="Expenses"
      accountPath="Expenses"
      balance="₹7,24,800.00"
      cards={[]}
      txnCount={184}
      currency="INR"
      defaultViewMode="overview"
      overviewBody={<SpendingDashboard {...SAMPLE} />}
    />
  ),
}
