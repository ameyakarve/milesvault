---
title: Bank overview
---

```js
// Bound by the taxonomy at Assets:Bank — applies to every Assets:Bank:* account
// (HDFC, BoA, etc.) via self+descendants prefix resolution.
import * as Plot from 'npm:@observablehq/plot'

const params = new URLSearchParams(window.location.search)
const account = params.get('account') ?? ''
const currency = params.get('currency') ?? ''

// Pull every entry touching this account, paginating until exhausted. The
// existing API caps each page at 100; for typical bank accounts that's a
// handful of round trips. Replace with a bulk endpoint if this becomes a
// bottleneck.
async function fetchEntries(account) {
  const out = []
  let offset = 0
  const limit = 100
  for (;;) {
    const url = `/api/ledger/accounts/${encodeURIComponent(account)}/entries?limit=${limit}&offset=${offset}`
    const r = await fetch(url, { credentials: 'same-origin' })
    if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`)
    const body = await r.json()
    out.push(...body.entries)
    offset += body.entries.length
    if (offset >= body.total || body.entries.length === 0) break
  }
  return out
}

const entries = account ? await fetchEntries(account) : []
```

```js
// Reduce entries → posting facts on this account in this currency, with running
// balance.
function buildFacts(entries, account, currency) {
  const txns = entries
    .filter((e) => e.kind === 'txn')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))
  const facts = []
  let running = 0
  for (const t of txns) {
    let net = 0
    const counterparties = []
    for (const p of t.postings) {
      if (p.amount == null || p.currency !== currency) continue
      const v = Number(p.amount)
      if (!Number.isFinite(v)) continue
      const matches = p.account === account || p.account.startsWith(account + ':')
      if (matches) net += v
      else counterparties.push({ account: p.account, amount: v })
    }
    if (net === 0 && counterparties.length === 0) continue
    running += net
    facts.push({
      date: new Date(t.date + 'T00:00:00Z'),
      net,
      running,
      payee: t.payee || '',
      narration: t.narration || '',
      counterparties,
    })
  }
  return facts
}

const facts = buildFacts(entries, account, currency)
```

# ${account || 'Bank overview'}

<div class="card" style="padding:16px">
${facts.length === 0
  ? html`<div style="color:#64748b;font-size:13px">No activity in ${currency || '—'}.</div>`
  : html`<div style="font-size:13px;color:#475569">${facts.length} transactions · current balance ${facts[facts.length - 1].running.toLocaleString()} ${currency}</div>`}
</div>

```js
// Balance-over-time line chart.
display(
  facts.length === 0
    ? html`<div style="padding:16px;color:#64748b">No data to chart.</div>`
    : Plot.plot({
        height: 240,
        marginLeft: 60,
        marginBottom: 30,
        x: { type: 'time', label: null },
        y: { grid: true, label: `Balance (${currency})` },
        marks: [
          Plot.ruleY([0]),
          Plot.areaY(facts, { x: 'date', y: 'running', fill: '#00685f', fillOpacity: 0.08 }),
          Plot.lineY(facts, { x: 'date', y: 'running', stroke: '#00685f', strokeWidth: 1.5 }),
          Plot.dot(facts, { x: 'date', y: 'running', fill: '#00685f', r: 2 }),
        ],
      }),
)
```

```js
// Counter-account composition: summed flow per non-self posting account.
function buildComposition(facts) {
  const totals = new Map()
  for (const f of facts) {
    for (const cp of f.counterparties) {
      totals.set(cp.account, (totals.get(cp.account) ?? 0) + cp.amount)
    }
  }
  return [...totals.entries()]
    .map(([account, amount]) => ({ account, amount, abs: Math.abs(amount) }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 8)
}
const comp = buildComposition(facts)
```

## Top counter-accounts

```js
display(
  comp.length === 0
    ? html`<div style="color:#64748b;font-size:13px">No counter-account activity.</div>`
    : Plot.plot({
        height: Math.max(180, comp.length * 28),
        marginLeft: 200,
        x: { grid: true, label: `Net flow (${currency})` },
        y: { label: null, domain: comp.map((c) => c.account) },
        marks: [
          Plot.ruleX([0]),
          Plot.barX(comp, {
            x: 'amount',
            y: 'account',
            fill: (d) => (d.amount < 0 ? '#e11d48' : '#00685f'),
          }),
        ],
      }),
)
```
