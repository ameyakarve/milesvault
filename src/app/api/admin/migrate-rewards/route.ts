import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { kbHttpOverFetch } from '@/durable/agents/tools/concierge/kb-tools'
import { listRewardAccounts } from '@/durable/agents/tools/editor/card-guide'

export const dynamic = 'force-dynamic'

// Owner-only, one-off migration: rewrite a single user's ledger to the one-shape
// reward convention — every `Assets:Rewards:{Miles,Points,Status}:<X>` collapses
// to its canonical `Assets:Rewards:<X>`, resolved BY COMMODITY from the KG (bank
// currency → issuer wallet `Assets:Rewards:<bank>`; standalone programme →
// `Assets:Rewards:<programme>`; a status counter folds into its programme's
// account). A FULL-ledger refresh: read every entry, rewrite, and re-commit the
// whole thing through replaceBuffer (re-parse + validate + rebuild). `dryRun`
// (default true) returns the mapping + before/after and writes NOTHING.
//
// POST { email, dryRun? }  — gated to the owner. Run dryRun first, eyeball the
// mapping + diff, then POST again with dryRun:false.
const OWNER_EMAIL = 'ameya.karve@gmail.com'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  // Owner gate: the owner's storage key is their email.
  if (session?.user?.key !== OWNER_EMAIL) return new NextResponse('forbidden', { status: 403 })

  const body = (await req.json().catch((): null => null)) as
    | { email?: string; id?: string; dryRun?: boolean; buffer?: string; expectBefore?: string }
    | null
  const email = body?.email?.trim()
  const id = body?.id?.trim()
  const dryRun = body?.dryRun !== false // default true — never write unless explicitly false
  if (!email && !id) return NextResponse.json({ error: 'email or id required' }, { status: 400 })

  const { env } = await getCloudflareContext({ async: true })
  const e = env as Cloudflare.Env
  const kb = kbHttpOverFetch('https://kb', e.KB)
  // Target by raw DO id (idFromString — lets us enumerate every ledger from the
  // namespace object listing, no email needed) or by email (idFromName).
  const doId = id ? e.LEDGER_DO.idFromString(id) : e.LEDGER_DO.idFromName(email!)
  const stub = e.LEDGER_DO.get(doId)
  const label = email ?? id!

  // RAW-APPLY mode: caller supplies the exact, hand-reviewed full ledger text;
  // we swap the whole ledger to it via replaceBuffer (re-parse + validate). No
  // auto-mapping. Verify by reading the ledger back after.
  const rawBuffer = typeof body?.buffer === 'string' ? body.buffer : null
  if (rawBuffer != null) {
    const { rows: cur } = (await stub.listEntries()) as {
      rows: Array<{ kind: string; id: number; raw_text: string; updated_at: number }>
    }
    const result = await stub.replaceBuffer({
      knownIds: cur.map((r) => ({ kind: r.kind as never, id: r.id, expected_updated_at: r.updated_at })),
      buffer: rawBuffer,
    })
    return NextResponse.json({ target: label, mode: 'raw', applied: 'ok' in result ? result.ok : true, result })
  }

  // 1. ticker → canonical account for every loyalty currency (programmes + bank
  //    pools), straight from the KG — the SAME resolver the editor/ingest use.
  const rewards = await listRewardAccounts(kb)
  const tickerToAccount = new Map(rewards.map((r) => [r.ticker.toUpperCase(), r.account]))

  // A status-counter commodity isn't in that list — resolve it to its programme's
  // account via QUALIFIES_TOWARD (counter currency → programme currency → account).
  const canonCache = new Map<string, string | null>()
  const canonicalFor = async (ticker: string): Promise<string | null> => {
    const tk = ticker.toUpperCase()
    const direct = tickerToAccount.get(tk)
    if (direct) return direct
    if (canonCache.has(tk)) return canonCache.get(tk)!
    let acct: string | null = null
    try {
      const node = (await kb.get(`currency/${ticker.toLowerCase()}`).catch((): null => null)) as {
        slug?: string
      } | null
      if (node?.slug) {
        const rel = (await kb
          .related(node.slug, { edge_type: 'QUALIFIES_TOWARD', direction: 'outgoing' })
          .catch((): null => null)) as { items?: Array<{ other: string }> } | null
        const progSlug = (rel?.items ?? []).map((i) => i.other).find((o) => o.startsWith('currency/'))
        if (progSlug) {
          const prog = (await kb.get(progSlug).catch((): null => null)) as {
            attrs?: Record<string, unknown> | null
          } | null
          const pt = typeof prog?.attrs?.ticker === 'string' ? prog.attrs.ticker.toUpperCase() : null
          if (pt) acct = tickerToAccount.get(pt) ?? null
        }
      }
    } catch {
      /* leave unresolved */
    }
    canonCache.set(tk, acct)
    return acct
  }

  // 2. Every reward (account, currency) this ledger actually uses.
  const sql =
    "SELECT DISTINCT account, currency FROM postings WHERE account LIKE 'Assets:Rewards:%' " +
    "UNION SELECT DISTINCT account, currency FROM directives_balance WHERE account LIKE 'Assets:Rewards:%'"
  const q = (await stub.query_sql(sql).catch((): { rows: unknown[] } => ({ rows: [] }))) as {
    rows: Array<{ account: string; currency: string }>
  }
  const byAccount = new Map<string, Set<string>>()
  for (const { account, currency } of q.rows ?? []) {
    let set = byAccount.get(account)
    if (!set) byAccount.set(account, (set = new Set()))
    set.add(currency)
  }

  // 3. old account → new account, only where it actually changes. An account
  //    whose commodities resolve to >1 target, or any unresolved commodity, is
  //    NOT rewritten (flagged for manual review instead of a risky guess).
  const oldToNew = new Map<string, string>()
  const conflicts: Array<{ account: string; currencies: string[]; targets: string[] }> = []
  const unresolved: Array<{ account: string; currencies: string[] }> = []
  for (const [account, ccys] of byAccount) {
    const targets = new Set<string>()
    let anyUnresolved = false
    for (const c of ccys) {
      const t = await canonicalFor(c)
      if (t) targets.add(t)
      else anyUnresolved = true
    }
    if (anyUnresolved) unresolved.push({ account, currencies: [...ccys] })
    else if (targets.size === 1) {
      const nw = [...targets][0]!
      if (nw !== account) oldToNew.set(account, nw)
    } else if (targets.size > 1) conflicts.push({ account, currencies: [...ccys], targets: [...targets] })
  }

  // 4. Full-ledger refresh: rewrite every entry's text (longest account first so
  //    a parent never shadows a child), preserving any `:Pending` suffix.
  const order = [...oldToNew.keys()].sort((a, b) => b.length - a.length)
  const rewrite = (text: string): string => {
    let out = text
    for (const old of order) {
      out = out.replace(new RegExp(`${escapeRe(old)}(?=:Pending\\b|\\s|$)`, 'g'), oldToNew.get(old)!)
    }
    return out
  }
  const { rows } = (await stub.listEntries()) as { rows: Array<{ kind: string; id: number; raw_text: string; updated_at: number }> }
  let changedEntries = 0
  const after: string[] = []
  for (const r of rows) {
    const t = rewrite(r.raw_text)
    if (t !== r.raw_text) changedEntries++
    after.push(t)
  }
  const afterBuffer = after.join('\n\n')

  const summary = {
    target: label,
    dryRun,
    mapping: Object.fromEntries(oldToNew),
    conflicts,
    unresolved,
    totalEntries: rows.length,
    changedEntries,
  }

  if (dryRun) {
    return NextResponse.json({ ...summary, before: rows.map((r) => r.raw_text).join('\n\n'), after: afterBuffer })
  }

  if (changedEntries === 0) return NextResponse.json({ ...summary, applied: false, note: 'nothing to change' })

  const result = await stub.replaceBuffer({
    knownIds: rows.map((r) => ({ kind: r.kind as never, id: r.id, expected_updated_at: r.updated_at })),
    buffer: afterBuffer,
  })
  return NextResponse.json({ ...summary, applied: 'ok' in result ? result.ok : true, result })
}
