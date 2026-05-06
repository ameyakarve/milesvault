import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React from 'react'
import { NotebookShell } from '../notebook-shell'
import { IncomeDashboard } from './income-dashboard'
import type { OverviewViewProps } from '../overview-view'

const meta: Meta = { title: 'Ledger / Income Dashboard', parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } } }
export default meta

// Income postings are credit-normal (negative). The dashboard negates so the
// trend climbs upward. Sample stays in raw negative form to mimic real data.
const SAMPLE: OverviewViewProps = {
  kpis: [],
  trend: {
    title: 'Cumulative income',
    currency: 'INR',
    highlightIndex: 11,
    points: [
      { x: 'May 25', y: -1_50_000, label: 'May 25 · ₹1,50,000.00' },
      { x: 'Jun', y: -3_00_000, label: 'Jun 25 · ₹3,00,000.00' },
      { x: 'Jul', y: -4_50_000, label: 'Jul 25 · ₹4,50,000.00' },
      { x: 'Aug', y: -6_00_000, label: 'Aug 25 · ₹6,00,000.00' },
      { x: 'Sep', y: -7_50_000, label: 'Sep 25 · ₹7,50,000.00' },
      { x: 'Oct', y: -9_00_000, label: 'Oct 25 · ₹9,00,000.00' },
      { x: 'Nov', y: -10_50_000, label: 'Nov 25 · ₹10,50,000.00' },
      { x: 'Dec', y: -14_00_000, label: 'Dec 25 · ₹14,00,000.00' },
      { x: 'Jan 26', y: -15_50_000, label: 'Jan 26 · ₹15,50,000.00' },
      { x: 'Feb', y: -17_00_000, label: 'Feb 26 · ₹17,00,000.00' },
      { x: 'Mar', y: -18_50_000, label: 'Mar 26 · ₹18,50,000.00' },
      { x: 'Apr', y: -20_00_000, label: 'Apr 26 · ₹20,00,000.00' },
    ],
  },
  composition: {
    title: 'Top destinations',
    moreCount: 0,
    rows: [
      { prefix: 'Assets:Bank:HDFC:', leaf: 'Savings', amount: '+₹17,40,000.00', amountClass: 'text-slate-900', scale: 1.0 },
      { prefix: 'Assets:Investments:Zerodha:', leaf: 'Stocks', amount: '+₹2,00,000.00', amountClass: 'text-slate-900', scale: 0.12 },
      { prefix: 'Assets:Bank:ICICI:', leaf: 'Salary', amount: '+₹60,000.00', amountClass: 'text-slate-900', scale: 0.034 },
    ],
  },
  events: {
    title: 'Notable income',
    rows: [
      { date: '2026-04-30', payee: 'Employer', narration: 'April salary', amount: '+₹1,50,000.00', amountClass: 'text-slate-900' },
      { date: '2026-03-31', payee: 'Employer', narration: 'March salary + bonus', amount: '+₹3,50,000.00', amountClass: 'text-slate-900' },
      { date: '2026-03-15', payee: 'Zerodha', narration: 'Q4 dividends', amount: '+₹18,400.00', amountClass: 'text-slate-900' },
      { date: '2026-02-28', payee: 'Employer', narration: 'February salary', amount: '+₹1,50,000.00', amountClass: 'text-slate-900' },
      { date: '2026-01-31', payee: 'Employer', narration: 'January salary', amount: '+₹1,50,000.00', amountClass: 'text-slate-900' },
    ],
  },
}

export const Default: StoryObj = {
  render: () => (
    <NotebookShell
      breadcrumb={['Income']}
      accountTitle="Income"
      accountPath="Income"
      balance="−₹20,00,000.00"
      cards={[]}
      txnCount={64}
      currency="INR"
      defaultViewMode="overview"
      overviewBody={<IncomeDashboard {...SAMPLE} />}
    />
  ),
}
