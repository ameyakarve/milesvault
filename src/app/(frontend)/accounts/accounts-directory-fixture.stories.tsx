import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React from 'react'
import { AccountsDirectory, type AccountRow } from './accounts-directory'

const ROWS: AccountRow[] = [
  { path: 'Assets:Cash:Wallet', currency: 'INR', balance: 8500, lastActivity: '2026-04-28' },
  {
    path: 'Liabilities:CreditCard:HDFC:DinersBlack',
    currency: 'INR',
    balance: -275000,
    lastActivity: '2026-04-28',
  },
  {
    path: 'Expenses:Food:Groceries',
    currency: 'INR',
    balance: -98500,
    lastActivity: '2026-04-28',
  },
  {
    path: 'Assets:Bank:HDFC:Savings',
    currency: 'INR',
    balance: 452000,
    lastActivity: '2026-04-27',
  },
  {
    path: 'Liabilities:CreditCard:HSBC:Cashback',
    currency: 'INR',
    balance: -132450,
    lastActivity: '2026-04-26',
  },
  {
    path: 'Income:Salary:AcmeCorp',
    currency: 'INR',
    balance: 2880000,
    lastActivity: '2026-04-25',
  },
  {
    path: 'Assets:Bank:HDFC:Salary',
    currency: 'INR',
    balance: 120000,
    lastActivity: '2026-04-25',
  },
  {
    path: 'Liabilities:CreditCard:HSBC:Cashback',
    currency: 'USD',
    balance: -1860,
    lastActivity: '2026-04-22',
  },
  {
    path: 'Assets:Rewards:BritishAirways',
    currency: 'AVIOS',
    balance: 47500,
    lastActivity: '2026-04-20',
  },
  { path: 'Income:Interest', currency: 'INR', balance: 45000, lastActivity: '2026-04-15' },
  {
    path: 'Assets:Investments:Crypto:Coinbase',
    currency: 'BTC',
    balance: 0.425,
    lastActivity: '2026-04-10',
  },
  {
    path: 'Liabilities:Loans:Home',
    currency: 'INR',
    balance: -4850000,
    lastActivity: '2026-04-01',
  },
  {
    path: 'Assets:Investments:Stocks:Zerodha',
    currency: 'INR',
    balance: 1240000,
    lastActivity: '2026-03-12',
  },
  {
    path: 'Assets:Investments:Stocks:Zerodha',
    currency: 'USD',
    balance: 15000,
    lastActivity: '2026-03-01',
  },
  {
    path: 'Expenses:Travel:Flights',
    currency: 'INR',
    balance: -185000,
    lastActivity: '2025-09-22',
  },
  {
    path: 'Assets:Bank:ICICI:OldChecking',
    currency: 'INR',
    balance: 2400,
    lastActivity: '2025-08-10',
  },
  {
    path: 'Liabilities:CreditCard:Citi:Rewards',
    currency: 'INR',
    balance: -450,
    lastActivity: '2025-02-14',
  },
  {
    path: 'Liabilities:CreditCard:Amex:Platinum',
    currency: 'INR',
    balance: 0,
    lastActivity: '2024-09-30',
  },
  {
    path: 'Equity:OpeningBalances',
    currency: 'INR',
    balance: 210000,
    lastActivity: '2023-08-15',
  },
  {
    path: 'Income:Salary:OldGig',
    currency: 'INR',
    balance: 0,
    lastActivity: '2023-07-31',
  },
]

const meta: Meta = {
  title: 'Accounts / Directory Fixture',
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
}
export default meta

export const Default: StoryObj = {
  render: () => (
    <AccountsDirectory
      rows={ROWS}
      recentPath="Liabilities:CreditCard:HSBC:Cashback"
      initialAsOf="2026-04-29"
    />
  ),
}
