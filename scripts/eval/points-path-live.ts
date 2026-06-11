import { buildPointsPaths } from '../../src/durable/agents/tools/concierge/points-paths'
import { kbHttpOverFetch } from '../../src/durable/agents/tools/concierge/kb-tools'

const kb = kbHttpOverFetch('https://milesvault-kb-staging.ameyakarve.workers.dev', {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
} as never)

const r = await buildPointsPaths(kb, 'Aeroplan')
console.log('target:', JSON.stringify(r.target))
console.log('notes:', r.notes)
console.log('nodes:', r.nodes.length, 'edges:', r.edges.length)
const hdfc = r.nodes.filter((n) => (n.slug ?? '').includes('hdfc') || (n.display ?? '').toLowerCase().includes('hdfc') || (n.display ?? '').toLowerCase().includes('infinia'))
console.log('HDFC nodes:', JSON.stringify(hdfc.map((n) => ({ slug: n.slug, display: (n as {display?:string}).display, mult: n.multiplier, hops: n.hops, held: n.held })), null, 1))
const infiniaEdges = r.edges.filter((e) => (e.from ?? '').includes('hdfc') || (e.to ?? '').includes('hdfc'))
console.log('HDFC edges:', JSON.stringify(infiniaEdges.slice(0, 6), null, 1))

console.log('node keys sample:', Object.keys(r.nodes[0] ?? {}))
console.log('first node:', JSON.stringify(r.nodes[0]))

import { applyHoldings } from '../../src/durable/agents/tools/concierge/points-paths'
applyHoldings(
  r,
  [
    { account: 'Liabilities:CreditCards:HDFC:Infinia:1784' },
    { account: 'Assets:Rewards:HDFC' },
    { account: 'Liabilities:CreditCards:Axis:MagnusBurgundy' },
    { account: 'Assets:Rewards:Axis' },
  ],
  [],
)
const held = r.nodes.filter((n) => n.held).map((n) => (n as { display?: string }).display)
console.log('HELD with owner accounts:', held)
