import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React from 'react'
import { NotebookShell } from '../notebook-shell'
import { NetWorthDashboard } from './net-worth-dashboard'
import type { OverviewViewProps } from '../overview-view'

const meta: Meta = { title: 'Ledger / Net Worth Dashboard', parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } } }
export default meta

const SAMPLE: OverviewViewProps = {
  kpis: [],
  trend: {
    title: 'Total assets over time',
    currency: 'INR',
    highlightIndex: 11,
    points: [
      { x: 'May 25', y: 12_40_000, label: 'May 25 · ₹12,40,000.00' },
      { x: 'Jun', y: 13_05_000, label: 'Jun 25 · ₹13,05,000.00' },
      { x: 'Jul', y: 13_70_000, label: 'Jul 25 · ₹13,70,000.00' },
      { x: 'Aug', y: 14_50_000, label: 'Aug 25 · ₹14,50,000.00' },
      { x: 'Sep', y: 15_25_000, label: 'Sep 25 · ₹15,25,000.00' },
      { x: 'Oct', y: 16_15_000, label: 'Oct 25 · ₹16,15,000.00' },
      { x: 'Nov', y: 16_90_000, label: 'Nov 25 · ₹16,90,000.00' },
      { x: 'Dec', y: 17_85_000, label: 'Dec 25 · ₹17,85,000.00' },
      { x: 'Jan 26', y: 18_60_000, label: 'Jan 26 · ₹18,60,000.00' },
      { x: 'Feb', y: 19_45_000, label: 'Feb 26 · ₹19,45,000.00' },
      { x: 'Mar', y: 20_30_000, label: 'Mar 26 · ₹20,30,000.00' },
      { x: 'Apr', y: 21_25_000, label: 'Apr 26 · ₹21,25,000.00' },
    ],
  },
  composition: {
    title: 'Top counter-accounts',
    moreCount: 6,
    rows: [
      { prefix: 'Income:Salary:', leaf: 'Employer', amount: '−₹17,40,000.00', amountClass: 'text-rose-600', scale: 1.0 },
      { prefix: 'Expenses:', leaf: 'Housing', amount: '+₹4,80,000.00', amountClass: 'text-slate-900', scale: 0.276 },
      { prefix: 'Liabilities:CreditCards:HDFC:', leaf: 'Infinia', amount: '−₹2,40,000.00', amountClass: 'text-rose-600', scale: 0.138 },
      { prefix: 'Expenses:', leaf: 'Travel', amount: '+₹1,64,000.00', amountClass: 'text-slate-900', scale: 0.094 },
      { prefix: 'Income:', leaf: 'Dividend', amount: '−₹48,400.00', amountClass: 'text-rose-600', scale: 0.028 },
    ],
  },
  events: {
    title: 'Notable transactions',
    rows: [
      { date: '2026-04-30', payee: 'Employer', narration: 'April salary', amount: '+₹1,50,000.00', amountClass: 'text-slate-900' },
      { date: '2026-03-31', payee: 'Employer', narration: 'March salary + bonus', amount: '+₹3,50,000.00', amountClass: 'text-slate-900' },
      { date: '2026-03-22', payee: 'Apple India', narration: 'iPhone 17 Pro', amount: '−₹1,28,900.00', amountClass: 'text-rose-600' },
      { date: '2026-02-28', payee: 'Employer', narration: 'February salary', amount: '+₹1,50,000.00', amountClass: 'text-slate-900' },
      { date: '2026-01-31', payee: 'Employer', narration: 'January salary', amount: '+₹1,50,000.00', amountClass: 'text-slate-900' },
    ],
  },
  headerStats: { balance: '₹21,25,000.00' },
}

export const Default: StoryObj = {
  render: () => (
    <NotebookShell
      breadcrumb={['Assets']}
      accountTitle="Assets"
      accountPath="Assets"
      cards={[]}
      txnCount={246}
      currency="INR"
      overviewBody={<NetWorthDashboard {...SAMPLE} />}
    />
  ),
}
