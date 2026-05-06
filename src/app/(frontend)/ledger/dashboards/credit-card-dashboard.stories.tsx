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
  // Monthly net = sum of signed posting deltas on the CC. Raw values are
  // negative for charge-heavy months and positive for payment-heavy months;
  // the dashboard negates so positive bars read as "added to debt."
  monthlyNet: {
    currency: 'INR',
    totalLabel: '−₹1,24,800.00',
    points: [
      { x: 'May 25', y: -42_100, label: 'May 25 · +₹42,100.00' },
      { x: 'Jun', y: -14_300, label: 'Jun 25 · +₹14,300.00' },
      { x: 'Jul', y: 17_500, label: 'Jul 25 · −₹17,500.00' },
      { x: 'Aug', y: -32_300, label: 'Aug 25 · +₹32,300.00' },
      { x: 'Sep', y: 2_700, label: 'Sep 25 · −₹2,700.00' },
      { x: 'Oct', y: -13_900, label: 'Oct 25 · +₹13,900.00' },
      { x: 'Nov', y: -11_700, label: 'Nov 25 · +₹11,700.00' },
      { x: 'Dec', y: -18_200, label: 'Dec 25 · +₹18,200.00' },
      { x: 'Jan 26', y: 13_600, label: 'Jan 26 · −₹13,600.00' },
      { x: 'Feb', y: -7_700, label: 'Feb 26 · +₹7,700.00' },
      { x: 'Mar', y: -12_500, label: 'Mar 26 · +₹12,500.00' },
      { x: 'Apr', y: -5_900, label: 'Apr 26 · +₹5,900.00' },
    ],
  },
  categoryBreakdown: {
    moreCount: 3,
    rows: [
      { prefix: 'Expenses:', leaf: 'Travel', amount: '₹68,400.00', amountClass: 'text-slate-900', scale: 1.0 },
      { prefix: 'Expenses:', leaf: 'Food', amount: '₹42,800.00', amountClass: 'text-slate-900', scale: 0.625 },
      { prefix: 'Expenses:', leaf: 'Shopping', amount: '₹36,200.00', amountClass: 'text-slate-900', scale: 0.53 },
      { prefix: 'Expenses:', leaf: 'Entertainment', amount: '₹18,600.00', amountClass: 'text-slate-900', scale: 0.272 },
      { prefix: 'Expenses:', leaf: 'Personal', amount: '₹9,800.00', amountClass: 'text-slate-900', scale: 0.143 },
      { prefix: 'Expenses:', leaf: 'Transport', amount: '₹4,200.00', amountClass: 'text-slate-900', scale: 0.061 },
    ],
  },
  paidFrom: {
    rows: [
      { prefix: 'Assets:Bank:HDFC:', leaf: 'Savings', amount: '₹1,20,000.00', amountClass: 'text-slate-900', scale: 1.0 },
      { prefix: 'Assets:Bank:ICICI:', leaf: 'Salary', amount: '₹60,000.00', amountClass: 'text-slate-900', scale: 0.5 },
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
