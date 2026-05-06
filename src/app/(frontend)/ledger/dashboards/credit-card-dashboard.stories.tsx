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

// Liability accounts have credit-normal balances. The raw posting deltas are
// negative for charges and positive for payments. The dashboard negates for
// display so positive bars read as "added to debt."
const SAMPLE: OverviewViewProps = {
  kpis: [],
  trend: { title: '', currency: 'INR', points: [] },
  composition: { title: '', rows: [] },
  events: {
    title: 'Recent charges',
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
  // Monthly spend = sum of charges per month (payments excluded). Always
  // positive; the chart never crosses zero.
  monthlyNet: {
    currency: 'INR',
    totalLabel: '₹1,80,200.00',
    points: [
      { x: 'May 25', y: 42_100, label: 'May 25 · ₹42,100.00' },
      { x: 'Jun', y: 14_300, label: 'Jun 25 · ₹14,300.00' },
      { x: 'Jul', y: 8_900, label: 'Jul 25 · ₹8,900.00' },
      { x: 'Aug', y: 32_300, label: 'Aug 25 · ₹32,300.00' },
      { x: 'Sep', y: 11_400, label: 'Sep 25 · ₹11,400.00' },
      { x: 'Oct', y: 13_900, label: 'Oct 25 · ₹13,900.00' },
      { x: 'Nov', y: 11_700, label: 'Nov 25 · ₹11,700.00' },
      { x: 'Dec', y: 18_200, label: 'Dec 25 · ₹18,200.00' },
      { x: 'Jan 26', y: 9_800, label: 'Jan 26 · ₹9,800.00' },
      { x: 'Feb', y: 7_700, label: 'Feb 26 · ₹7,700.00' },
      { x: 'Mar', y: 12_500, label: 'Mar 26 · ₹12,500.00' },
      { x: 'Apr', y: 5_900, label: 'Apr 26 · ₹5,900.00' },
    ],
  },
  categoryBreakdown: {
    moreCount: 3,
    rows: [
      { prefix: 'Expenses:', leaf: 'Travel', amount: '₹68,400.00', amountClass: 'text-slate-900', scale: 1.0, value: 68400 },
      { prefix: 'Expenses:', leaf: 'Food', amount: '₹42,800.00', amountClass: 'text-slate-900', scale: 0.625, value: 42800 },
      { prefix: 'Expenses:', leaf: 'Shopping', amount: '₹36,200.00', amountClass: 'text-slate-900', scale: 0.53, value: 36200 },
      { prefix: 'Expenses:', leaf: 'Entertainment', amount: '₹18,600.00', amountClass: 'text-slate-900', scale: 0.272, value: 18600 },
      { prefix: 'Expenses:', leaf: 'Personal', amount: '₹9,800.00', amountClass: 'text-slate-900', scale: 0.143, value: 9800 },
      { prefix: 'Expenses:', leaf: 'Transport', amount: '₹4,200.00', amountClass: 'text-slate-900', scale: 0.061, value: 4200 },
    ],
  },
  paidFrom: {
    rows: [
      { prefix: 'Assets:Bank:HDFC:', leaf: 'Savings', amount: '₹1,20,000.00', amountClass: 'text-slate-900', scale: 1.0, value: 120000 },
      { prefix: 'Assets:Bank:ICICI:', leaf: 'Salary', amount: '₹60,000.00', amountClass: 'text-slate-900', scale: 0.5, value: 60000 },
    ],
  },
}

export const Default: StoryObj = {
  render: () => (
    <NotebookShell
      breadcrumb={['Liabilities', 'CreditCards', 'HDFC', 'Infinia']}
      accountTitle="Infinia"
      accountPath="Liabilities:CreditCards:HDFC:Infinia"
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
