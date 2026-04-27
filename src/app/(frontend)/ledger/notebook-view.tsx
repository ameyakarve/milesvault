'use client'

import { NotebookShell, type Card } from './notebook-shell'

const CARDS: Card[] = [
  {
    id: 'amazon',
    balance: '1,31,000.00',
    lines: [
      {
        lineNo: 1,
        segs: [
          { kind: 'date', text: '2023-11-20' },
          { kind: 'ws', text: ' ' },
          { kind: 'flag', text: '*' },
          { kind: 'ws', text: ' ' },
          { kind: 'payee', text: '"Amazon India"' },
          { kind: 'ws', text: ' ' },
          { kind: 'narration', text: '"Cloud Subscription"' },
        ],
      },
      {
        lineNo: 2,
        segs: [
          { kind: 'account', text: 'Assets:Bank:Checking' },
          { kind: 'ws', text: ' ' },
          { kind: 'number', text: '-1,249.00' },
          { kind: 'ws', text: ' ' },
          { kind: 'currency', text: 'INR' },
        ],
        delta: { sign: '−', value: '1,249.00', flow: 'out' },
      },
      {
        lineNo: 3,
        segs: [
          { kind: 'account', text: 'Expenses:Services:AWS' },
          { kind: 'ws', text: ' ' },
          { kind: 'number', text: '1,249.00' },
          { kind: 'ws', text: ' ' },
          { kind: 'currency', text: 'INR' },
        ],
      },
    ],
  },
  {
    id: 'starbucks',
    balance: '1,30,550.00',
    lines: [
      {
        lineNo: 5,
        active: true,
        segs: [
          { kind: 'date', text: '2023-11-21' },
          { kind: 'ws', text: ' ' },
          { kind: 'flag', text: '!' },
          { kind: 'ws', text: ' ' },
          { kind: 'payee', text: '"Starbucks Coffee"' },
          { kind: 'ws', text: ' ' },
          { kind: 'narration', text: '"Morning Brew"' },
        ],
      },
      {
        lineNo: 6,
        segs: [
          { kind: 'account', text: 'Assets:Bank:Checking' },
          { kind: 'ws', text: ' ' },
          { kind: 'number', text: '-450.00' },
          { kind: 'ws', text: ' ' },
          { kind: 'currency', text: 'INR' },
        ],
        delta: { sign: '−', value: '450.00', flow: 'out' },
      },
      {
        lineNo: 7,
        segs: [
          { kind: 'account', text: 'Expenses:Food:Coffee' },
          { kind: 'ws', text: ' ' },
          { kind: 'number', text: '450.00' },
          { kind: 'ws', text: ' ' },
          { kind: 'currency', text: 'INR' },
        ],
      },
    ],
  },
  {
    id: 'hdfc',
    balance: '1,34,000.00',
    lines: [
      {
        lineNo: 9,
        segs: [
          { kind: 'date', text: '2023-11-22' },
          { kind: 'ws', text: ' ' },
          { kind: 'flag', text: '*' },
          { kind: 'ws', text: ' ' },
          { kind: 'payee', text: '"HDFC Bank"' },
          { kind: 'ws', text: ' ' },
          { kind: 'narration', text: '"Interest Credit"' },
        ],
      },
      {
        lineNo: 10,
        segs: [
          { kind: 'account', text: 'Assets:Bank:Checking' },
          { kind: 'ws', text: ' ' },
          { kind: 'number', text: '3,450.00' },
          { kind: 'ws', text: ' ' },
          { kind: 'currency', text: 'INR' },
        ],
        delta: { sign: '+', value: '3,450.00', flow: 'in' },
      },
      {
        lineNo: 11,
        segs: [
          { kind: 'account', text: 'Income:Interest' },
          { kind: 'ws', text: ' ' },
          { kind: 'number', text: '-3,450.00' },
          { kind: 'ws', text: ' ' },
          { kind: 'currency', text: 'INR' },
        ],
      },
    ],
  },
  {
    id: 'apple',
    balance: '1,33,801.00',
    lines: [
      {
        lineNo: 13,
        segs: [
          { kind: 'date', text: '2023-11-23' },
          { kind: 'ws', text: ' ' },
          { kind: 'flag', text: '*' },
          { kind: 'ws', text: ' ' },
          { kind: 'payee', text: '"Apple Store"' },
          { kind: 'ws', text: ' ' },
          { kind: 'narration', text: '"App Store Purchase"' },
        ],
      },
      {
        lineNo: 14,
        segs: [
          { kind: 'account', text: 'Assets:Bank:Checking' },
          { kind: 'ws', text: ' ' },
          { kind: 'number', text: '-199.00' },
          { kind: 'ws', text: ' ' },
          { kind: 'currency', text: 'INR' },
        ],
        delta: { sign: '−', value: '199.00', flow: 'out' },
      },
      {
        lineNo: 15,
        segs: [
          { kind: 'account', text: 'Expenses:Digital:Apps' },
          { kind: 'ws', text: ' ' },
          { kind: 'number', text: '199.00' },
          { kind: 'ws', text: ' ' },
          { kind: 'currency', text: 'INR' },
        ],
      },
    ],
  },
  {
    id: 'zomato',
    balance: '1,32,911.00',
    lines: [
      {
        lineNo: 17,
        segs: [
          { kind: 'date', text: '2023-11-24' },
          { kind: 'ws', text: ' ' },
          { kind: 'flag', text: '*' },
          { kind: 'ws', text: ' ' },
          { kind: 'payee', text: '"Zomato Limited"' },
          { kind: 'ws', text: ' ' },
          { kind: 'narration', text: '"Dinner Order"' },
        ],
      },
      {
        lineNo: 18,
        segs: [
          { kind: 'account', text: 'Assets:Bank:Checking' },
          { kind: 'ws', text: ' ' },
          { kind: 'number', text: '-890.00' },
          { kind: 'ws', text: ' ' },
          { kind: 'currency', text: 'INR' },
        ],
        delta: { sign: '−', value: '890.00', flow: 'out' },
      },
      {
        lineNo: 19,
        segs: [
          { kind: 'account', text: 'Expenses:Food:Delivery' },
          { kind: 'ws', text: ' ' },
          { kind: 'number', text: '890.00' },
          { kind: 'ws', text: ' ' },
          { kind: 'currency', text: 'INR' },
        ],
      },
    ],
  },
]

export function NotebookView() {
  return (
    <NotebookShell
      breadcrumb={['Assets', 'Bank', 'Checking']}
      accountTitle="Bank Checking"
      accountPath="Liabilities:CreditCard:HDFC:DinersBlack"
      balance="₹1,32,450.00"
      cards={CARDS}
      txnCount={12}
      cursor="Ln 24, Col 8"
      unsaved
    />
  )
}
