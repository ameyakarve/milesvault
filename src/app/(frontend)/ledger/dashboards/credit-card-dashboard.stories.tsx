import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React from 'react'
import { NotebookShell } from '../notebook-shell'
import { CreditCardDashboard } from './credit-card-dashboard'
import type { OverviewViewProps } from '../overview-view'

const meta: Meta = {
  title: 'Ledger / Credit Card Dashboard',
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
}
export default meta

// Liability accounts have credit-normal balances. The raw running balance is
// negative as charges accrue; the dashboard negates for display.
const SAMPLE: OverviewViewProps = {
  kpis: [
    { label: 'Balance owed', value: '₹1,24,800.00', caption: 'as of today' },
    { label: 'Charges · 3M', value: '−₹2,18,400.00', valueClass: 'text-rose-600' },
    { label: 'Payments · 3M', value: '+₹1,80,000.00', valueClass: 'text-[#00685f]' },
  ],
  trend: {
    title: 'Amount owed over time',
    currency: 'INR',
    highlightIndex: 11,
    points: [
      { x: 'May 25', y: -42100, label: 'May 25 · ₹42,100.00' },
      { x: 'Jun', y: -56400, label: 'Jun 25 · ₹56,400.00' },
      { x: 'Jul', y: -38900, label: 'Jul 25 · ₹38,900.00' },
      { x: 'Aug', y: -71200, label: 'Aug 25 · ₹71,200.00' },
      { x: 'Sep', y: -68500, label: 'Sep 25 · ₹68,500.00' },
      { x: 'Oct', y: -82400, label: 'Oct 25 · ₹82,400.00' },
      { x: 'Nov', y: -94100, label: 'Nov 25 · ₹94,100.00' },
      { x: 'Dec', y: -1_12_300, label: 'Dec 25 · ₹1,12,300.00' },
      { x: 'Jan 26', y: -98700, label: 'Jan 26 · ₹98,700.00' },
      { x: 'Feb', y: -1_06_400, label: 'Feb 26 · ₹1,06,400.00' },
      { x: 'Mar', y: -1_18_900, label: 'Mar 26 · ₹1,18,900.00' },
      { x: 'Apr', y: -1_24_800, label: 'Apr 26 · ₹1,24,800.00' },
    ],
  },
  composition: {
    title: 'Top spend categories',
    moreCount: 8,
    rows: [
      // Positive raw amount = charges flowing OUT to Expenses (rose).
      {
        prefix: 'Expenses:',
        leaf: 'Travel',
        amount: '+₹68,400.00',
        amountClass: 'text-slate-900',
        scale: 1.0,
      },
      {
        prefix: 'Expenses:',
        leaf: 'Food',
        amount: '+₹42,800.00',
        amountClass: 'text-slate-900',
        scale: 0.62,
      },
      {
        prefix: 'Expenses:',
        leaf: 'Shopping',
        amount: '+₹36,200.00',
        amountClass: 'text-slate-900',
        scale: 0.53,
      },
      {
        prefix: 'Expenses:',
        leaf: 'Entertainment',
        amount: '+₹18,600.00',
        amountClass: 'text-slate-900',
        scale: 0.27,
      },
      // Negative raw amount = payments flowing IN from Bank (teal).
      {
        prefix: 'Assets:Bank:HDFC:',
        leaf: 'Savings',
        amount: '−₹1,80,000.00',
        amountClass: 'text-rose-600',
        scale: 0.85,
      },
    ],
  },
  events: {
    title: 'Notable charges',
    rows: [
      {
        date: '2026-04-28',
        payee: 'Cathay Pacific',
        narration: 'BLR → HKG return',
        amount: '+₹48,200.00',
        amountClass: 'text-slate-900',
      },
      {
        date: '2026-04-22',
        payee: 'HDFC Savings',
        narration: 'April statement payment',
        amount: '−₹60,000.00',
        amountClass: 'text-rose-600',
      },
      {
        date: '2026-04-18',
        payee: 'Apple India',
        narration: 'AirPods Pro',
        amount: '+₹24,900.00',
        amountClass: 'text-slate-900',
      },
      {
        date: '2026-04-12',
        payee: 'Toit Brewpub',
        narration: 'Birthday dinner',
        amount: '+₹8,400.00',
        amountClass: 'text-slate-900',
      },
      {
        date: '2026-03-31',
        payee: 'HDFC Savings',
        narration: 'March statement payment',
        amount: '−₹60,000.00',
        amountClass: 'text-rose-600',
      },
    ],
  },
}

export const Default: StoryObj = {
  render: () => (
    <NotebookShell
      breadcrumb={['Liabilities', 'CC', 'HDFC', 'Infinia']}
      accountTitle="Infinia"
      accountPath="Liabilities:CC:HDFC:Infinia"
      balance="−₹1,24,800.00"
      netIn="+₹1,80,000.00"
      netOut="−₹2,18,400.00"
      cards={[]}
      txnCount={28}
      currency="INR"
      defaultViewMode="overview"
      overviewBody={<CreditCardDashboard {...SAMPLE} />}
    />
  ),
}
