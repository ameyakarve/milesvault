#!/usr/bin/env node
// Tiny smoke test for src/lib/ledger-core/taxonomy.ts. Run with:
//   pnpm exec tsx scripts/verify-taxonomy.mjs
// Exits non-zero on any failure.

import {
  resolveDashboard,
  prefixChain,
  findTaxonomyNode,
  classifyKind,
} from '../src/lib/ledger-core/taxonomy.ts'

let failed = 0
function check(label, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    console.error(`FAIL ${label}\n  expected: ${e}\n  actual:   ${a}`)
    failed++
  } else {
    console.log(`ok   ${label}`)
  }
}

// prefixChain
check('prefixChain leaf', prefixChain('Assets:Bank:HDFC:Savings'), [
  'Assets:Bank:HDFC:Savings',
  'Assets:Bank:HDFC',
  'Assets:Bank',
  'Assets',
])
check('prefixChain root', prefixChain('Income'), ['Income'])

// findTaxonomyNode
check('findTaxonomyNode root present', findTaxonomyNode('Assets')?.label, 'Assets')
check('findTaxonomyNode nested present', findTaxonomyNode('Assets:Loaded:Wallets')?.label, 'Wallets')
check('findTaxonomyNode unknown', findTaxonomyNode('Mystery'), undefined)

// resolveDashboard — direct hit
check(
  'resolveDashboard direct prefix',
  resolveDashboard('Assets:Bank'),
  { slug: 'bank-overview' },
)

// resolveDashboard — descendant inheritance
check(
  'resolveDashboard descendant inherits Assets:Bank',
  resolveDashboard('Assets:Bank:HDFC:Savings'),
  { slug: 'bank-overview' },
)

// resolveDashboard — descendant of root with binding (Income → income)
check(
  'resolveDashboard descendant inherits Income',
  resolveDashboard('Income:Salary:Acme'),
  { slug: 'income' },
)

// resolveDashboard — more-specific binding overrides parent
// Assets has net-worth, Assets:Bank has bank-overview; Assets:Bank:* must win.
check(
  'resolveDashboard more-specific overrides parent',
  resolveDashboard('Assets:Bank:HDFC'),
  { slug: 'bank-overview' },
)

// resolveDashboard — parent binding wins when no specific child binding
// Assets:Cash has no dashboard, falls back to Assets → net-worth.
check(
  'resolveDashboard falls back to ancestor',
  resolveDashboard('Assets:Cash'),
  { slug: 'net-worth' },
)

// resolveDashboard — Liabilities has no root binding, but Liabilities:CC does.
check(
  'resolveDashboard credit-card descendant',
  resolveDashboard('Liabilities:CC:HDFC:Infinia'),
  { slug: 'credit-card' },
)
check(
  'resolveDashboard liabilities loan no binding',
  resolveDashboard('Liabilities:Loan:Mortgage:HDFC'),
  null,
)

// resolveDashboard — Equity has no binding anywhere
check('resolveDashboard equity null', resolveDashboard('Equity:Opening-Balances'), null)

// resolveDashboard — unknown root
check('resolveDashboard unknown root', resolveDashboard('Mystery:Path'), null)

// classifyKind
check('classifyKind Assets', classifyKind('Assets:Bank:HDFC'), 'Assets')
check('classifyKind Liabilities', classifyKind('Liabilities:CC:Amex'), 'Liabilities')
check('classifyKind unknown', classifyKind('Mystery:Path'), null)

if (failed > 0) {
  console.error(`\n${failed} failure(s)`)
  process.exit(1)
}
console.log('\nall taxonomy checks passed')
