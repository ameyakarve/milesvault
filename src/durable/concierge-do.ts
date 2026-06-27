import { generateText, stepCountIs, type ToolSet } from 'ai'
import { createCodeTool } from '@cloudflare/codemode/ai'
import { DynamicWorkerExecutor } from '@cloudflare/codemode'
import { buildConciergeSystem } from './agent-prompt'
import type { LedgerDO } from './ledger-do'
import { BaseAgentDO } from './base-agent-do'
import {
  makeConciergeRegistry,
  CONCIERGE_MODEL_ID,
  type ConciergeAgentName,
} from './agents/registries/concierge'
import { makeAirportLookup, seedAirports } from './agents/tools/concierge/airports-store'
import type { AirportLookup } from './agents/tools/concierge/award-engine'
import type { KbHttp } from './agents/tools/concierge/kb-tools'
import {
  askUserTool,
  buildAwardExplore,
  type AwardExploreResult,
  buildPointsPaths,
  buildPointsFrom,
  applyHoldings,
  type PointsPathsResult,
  type BalanceRow,
  listLoyaltyCurrencies,
  type LoyaltyCurrency,
  listMatchStatuses,
  heldStatusSlugs,
  buildStatusMatchPaths,
  type MatchStatusesResult,
  type StatusMatchResult,
  ensureRouteCache,
  buildAirlineExplorer,
  type AirlineExplorerResult,
  fetchKbAgentsMd,
  kbHttpOverFetch,
  ledgerSnapshotTool,
  makeKbTools,
  querySqlTool,
  resolveByBeancountName,
  resolveByTicker,
  showAwardOptionsTool,
} from './agents/tools/concierge'
import type { AgentHost, Registry } from './agents/types'
import { baseAccount, isPending, kgLookupParts } from '@/lib/ledger-core/account-display'
import { conciergeEnabled } from '@/lib/flags'

// The chat/agent runtime for the `/concierge` surface. Read-only Q&A — over
// the user's ledger (`analyst`) and the milesvault knowledge graph
// (`graph-walker`). Pure compute: every read goes to LedgerDO over RPC
// (ledger) or to the kb worker over HTTP (graph). No writes.
type Snapshot = Awaited<ReturnType<LedgerDO['ledger_snapshot']>>

export type ConciergeDOState = Record<string, never>

function todayInt(): number {
  const now = new Date()
  const yyyy = now.getUTCFullYear().toString().padStart(4, '0')
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = now.getUTCDate().toString().padStart(2, '0')
  return Number(`${yyyy}${mm}${dd}`)
}

// A held card account is identified by (issuer, leaf) — the issuer + product
// segments of `Liabilities:CreditCards:<issuer>:<leaf>`. The generic KB resolver
// is one-match-or-nothing on beancountName, so when a leaf collides across
// issuers (e.g. "Platinum" is both Amex and HSBC) we disambiguate HERE, in the
// domain layer, by the candidate's ISSUED_BY bank — composed from the generic kb
// primitives. The KB itself stays issuer-agnostic. Returns the same shape as
// resolveByBeancountName so call sites are unchanged.
async function resolveHeldCard(
  kb: KbHttp,
  issuer: string | null,
  leaf: string,
): Promise<{ slug: string; display_name: string | null } | null> {
  const r = (await kb
    .list('cc', { limit: 2000, fields: ['beancountName'] })
    .catch((): null => null)) as {
    items?: Array<{ slug: string; display_name: string | null; fields?: { beancountName?: unknown } }>
  } | null
  const cands = (r?.items ?? []).filter((i) => i.fields?.beancountName === leaf)
  if (cands.length === 0) return null
  if (cands.length === 1) return { slug: cands[0]!.slug, display_name: cands[0]!.display_name ?? null }
  // Collision: pick the candidate whose ISSUED_BY bank beancountName equals the
  // account path's issuer segment. Exact identity match, no fuzzy.
  if (!issuer) return null
  for (const c of cands) {
    const rel = (await kb
      .related(c.slug, { edge_type: 'ISSUED_BY', direction: 'outgoing' })
      .catch((): null => null)) as { items?: Array<{ other: string }> } | null
    const bankSlug = rel?.items?.find((i) => i.other.startsWith('bank/'))?.other
    if (!bankSlug) continue
    const bank = (await kb.get(bankSlug).catch((): null => null)) as {
      attrs?: Record<string, unknown> | null
    } | null
    if (bank?.attrs?.beancountName === issuer) {
      return { slug: c.slug, display_name: c.display_name ?? null }
    }
  }
  return null
}

export class ConciergeDO
  extends BaseAgentDO<Cloudflare.Env, ConciergeDOState>
  implements AgentHost<ConciergeAgentName>
{
  protected registry: Registry
  initialState: ConciergeDOState = {}

  // Per-turn context. Both fetched once in beforeTurnFetch (async) so the
  // sync system-prompt builder + every step can reuse them without further
  // RPC. Cleared after the turn config is built — the next turn re-fetches.
  private turnSnapshot: Snapshot | null = null
  private turnAgentsBriefing: string | null = null
  // The valid `/points` link targets (loyalty programmes) — injected into the
  // system prompt so the model copies an exact slug instead of inventing one.
  private turnPointsTargets: LoyaltyCurrency[] | null = null

  // Synthetic host for the kb service binding — only the path is used.
  private readonly KB_BASE = 'https://kb'

  // IATA → [lat,lng,cc] over this DO's own SQLite, seeded once. Used by the
  // award engine to resolve legs.
  private readonly airportLookup: AirportLookup

  // This DO's own SQLite — also backs the 7-day route_cache that
  // flight_search reads/writes. (Named `routeSql` to avoid the inherited
  // `sql` tagged-template helper on the Think base class.)
  private readonly routeSql: SqlStorage

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)
    this.registry = makeConciergeRegistry(this)
    this.routeSql = state.storage.sql
    seedAirports(state.storage.sql)
    ensureRouteCache(state.storage.sql)
    this.airportLookup = makeAirportLookup(state.storage.sql)
  }

  private ledgerStub(): DurableObjectStub<LedgerDO> {
    const ns = this.env.LEDGER_DO as unknown as DurableObjectNamespace<LedgerDO>
    return ns.get(ns.idFromName(this.name))
  }

  private snapshot(): Snapshot {
    return (
      this.turnSnapshot ?? {
        today: todayInt(),
        accounts: [],
        row_counts: {},
        sample_txns: '',
        schema_ddl: '',
      }
    )
  }

  protected override async beforeTurnFetch(): Promise<void> {
    // Kill switch: the concierge (in-app chat AND the Telegram bot, which both
    // drive this DO's turn loop) is gated behind the `concierge_enabled` flag.
    // `this.name` is the user's email — the key the Flagship admin rule matches.
    // Fail-closed: a disabled user's turn is refused before any model/tool runs.
    if (!(await conciergeEnabled(this.env, { email: this.name }))) {
      throw new Error('concierge is disabled for this account')
    }
    // Fetch both context sources in parallel. Either agent can hand off
    // mid-turn, so we can't gate on the agent active at turn start —
    // the receiving agent's system prompt is rebuilt per step.
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const [snapshot, briefing, pointsTargets] = await Promise.all([
      this.ledgerStub().ledger_snapshot(),
      fetchKbAgentsMd(this.KB_BASE, this.env.KB).catch((err) => {
        console.warn(`[concierge] kb agents.md fetch failed: ${err}`)
        return ''
      }),
      listLoyaltyCurrencies(kbHttp).catch((err) => {
        console.warn(`[concierge] loyalty currencies fetch failed: ${err}`)
        return [] as LoyaltyCurrency[]
      }),
    ])
    this.turnSnapshot = snapshot
    this.turnAgentsBriefing = briefing
    this.turnPointsTargets = pointsTargets
  }

  // ---- AgentHost<ConciergeAgentName> ----

  system(_name: ConciergeAgentName): string {
    return buildConciergeSystem(
      this.snapshot(),
      this.turnAgentsBriefing ?? '',
      this.turnPointsTargets ?? [],
    )
  }

  tools(_name: ConciergeAgentName): ToolSet {
    return this.conciergeTools()
  }

  // Data behind the fluid /explore page. Like awardPlan but returns a uniform
  // rows shape plus the distinct `airlines` for the include/exclude filter. The
  // explorer is purely a flight + award-availability view: it reads no card /
  // ledger / transfer data. "How do I accumulate these miles" (funding source,
  // holdings, transfer paths) lives on the Points page (/points). RPC for the
  // /api/concierge/award-explore route.
  async awardExplore(origin: string, destination: string): Promise<AwardExploreResult> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    return buildAwardExplore(
      this.airportLookup,
      this.routeSql,
      this.env.AERODATABOX_API_KEY,
      kbHttp,
      origin,
      destination,
    )
  }

  // Data behind the /points page — the backward dual of the explorer. Given a
  // target loyalty currency, returns the React-Flow graph of every way to
  // accumulate it (currencies that transfer in + the cards that earn them),
  // each source tagged with its cheapest ratio. RPC for the
  // /api/concierge/points-paths route.
  async pointsPaths(
    target: string,
    amount?: number,
    direction?: 'to' | 'from',
  ): Promise<PointsPathsResult> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const ledger = this.ledgerStub()
    const build =
      direction === 'from'
        ? buildPointsFrom(kbHttp, target, amount)
        : buildPointsPaths(kbHttp, target, amount)
    const [result, snapshot, balances] = await Promise.all([
      build,
      ledger.ledger_snapshot().catch((): null => null),
      ledger
        .query_sql('SELECT account, currency, scale, balance_scaled FROM balance_totals')
        .catch((): null => null),
    ])
    // Overlay the user's ledger: mark held nodes and attach current balances.
    applyHoldings(result, snapshot?.accounts ?? [], (balances?.rows ?? []) as BalanceRow[])
    return result
  }

  // The airline-explorer graph (what airlines can be booked using what,
  // clustered by alliance, cross-alliance edges only). Static — same for every
  // user — so cache it on the warm instance. RPC for /api/concierge/airline-explorer.
  private _airlineExplorer?: AirlineExplorerResult
  async airlineExplorer(): Promise<AirlineExplorerResult> {
    if (this._airlineExplorer) return this._airlineExplorer
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    this._airlineExplorer = await buildAirlineExplorer(kbHttp)
    return this._airlineExplorer
  }

  // The searchable target universe for the /points combobox — every loyalty
  // currency (slug + display name). RPC for /api/concierge/currencies.
  async loyaltyCurrencies(): Promise<LoyaltyCurrency[]> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    return listLoyaltyCurrencies(kbHttp)
  }

  // Status Match Merry-Go-Round: a chain of status matches from one status to
  // another. RPC for /api/concierge/status-match-paths.
  async statusMatchPaths(from: string, to: string): Promise<StatusMatchResult> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    return buildStatusMatchPaths(kbHttp, from, to)
  }

  // The searchable status universe (status-tiers + alliance-tiers) for the
  // merry-go-round from/to comboboxes, plus the tier slugs the user holds
  // (from `status:*` event directives, newest per program; empty when the
  // ledger has none). RPC for /api/concierge/match-statuses.
  async matchStatuses(): Promise<MatchStatusesResult> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const [statuses, events] = await Promise.all([
      listMatchStatuses(kbHttp),
      this.ledgerStub()
        .query_sql(
          "SELECT name, value FROM directives_event WHERE name LIKE 'status:%' ORDER BY date ASC, id ASC",
        )
        .catch((): null => null),
    ])
    const rows = (events?.rows ?? []) as Array<{ name: string; value: string }>
    return { statuses, held: heldStatusSlugs(rows, statuses) }
  }

  // KG display names for the user's held accounts (cards via cc/ resolve
  // verified on attrs.beancountName, points/status via currency/ resolve —
  // the same verification matchAccount/applyHoldings use). Accounts the KG
  // doesn't know stay unset; the UI falls back to path-derived labels.
  // RPC for /api/concierge/account-names.
  // KG display names for held accounts. Currencies match by COMMODITY
  // ticker (the registry key — exact), falling back to beancountName text
  // resolution for accounts without a known commodity; cards match by
  // issuer+product name verified on beancountName. RPC for
  // /api/concierge/account-names.
  async accountNames(): Promise<{ names: Record<string, string> }> {
    const ledger = this.ledgerStub()
    const [snapshot, balances] = await Promise.all([
      ledger.ledger_snapshot().catch((): null => null),
      ledger
        .query_sql('SELECT account, currency FROM balance_totals')
        .catch((): null => null),
    ])
    const accounts = (snapshot?.accounts ?? []) as ReadonlyArray<{
      account: string
      currencies?: string[]
    }>
    const balRows = (balances?.rows ?? []) as Array<{ account: string; currency: string }>
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const names: Record<string, string> = {}

    // account → candidate commodities (open-directive constraints + balances)
    const commoditiesOf = (account: string): string[] => {
      const out = new Set<string>()
      for (const a of accounts) if (a.account === account) for (const c of a.currencies ?? []) out.add(c)
      for (const b of balRows) if (b.account === account) out.add(b.currency)
      return [...out]
    }

    await Promise.all(
      accounts.map(async ({ account }) => {
        if (isPending(account)) return // folds into its parent everywhere
        const parts = kgLookupParts(account)
        if (!parts) return
        if (parts.kind === 'currency') {
          for (const ticker of commoditiesOf(account)) {
            const byTicker = await resolveByTicker(kbHttp, ticker)
            if (byTicker?.display_name) {
              names[account] = byTicker.display_name
              return
            }
          }
          const hit = await resolveByBeancountName(
            kbHttp,
            'currency',
            parts.leaf,
            parts.issuer ? { displayMustContain: parts.issuer } : {},
          )
          if (hit?.display_name) names[account] = hit.display_name
          return
        }
        const hit = await resolveHeldCard(kbHttp, parts.issuer, parts.product)
        if (hit?.display_name) names[account] = hit.display_name
      }),
    )
    return { names }
  }

  // Card → rewards linkage for the per-account page (owner ask): each held
  // credit card resolved in the KG (same beancountName verification as
  // accountNames), then DENOMINATED_IN → the currency it earns, matched back
  // to the user's Assets:Rewards account with its live balance. Cards the KG
  // doesn't know, or currencies without a held account, degrade gracefully
  // (name without link, or no entry). RPC for /api/concierge/card-links.
  async cardLinks(debug = false): Promise<{
    links: Array<{
      card: string
      rewards_account: string | null
      rewards_name: string | null
      rewards_currency: string | null
      rewards_balance: number | null
    }>
    trace?: Array<Record<string, unknown>>
  }> {
    const ledger = this.ledgerStub()
    const [snapshot, balances] = await Promise.all([
      ledger.ledger_snapshot().catch((): null => null),
      ledger
        .query_sql('SELECT account, currency, scale, balance_scaled FROM balance_totals')
        .catch((): null => null),
    ])
    const accounts = (snapshot?.accounts ?? []) as ReadonlyArray<{ account: string }>
    const balRows = (balances?.rows ?? []) as Array<{
      account: string
      currency: string
      scale: number
      balance_scaled: number
    }>
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)

    const cards = accounts.filter((a) => a.account.startsWith('Liabilities:CreditCards:'))
    const links: Array<{
      card: string
      rewards_account: string | null
      rewards_name: string | null
      rewards_currency: string | null
      rewards_balance: number | null
    }> = []

    const trace: Array<Record<string, unknown>> = []
    await Promise.all(
      cards.map(async ({ account }) => {
        const parts = kgLookupParts(account)
        if (!parts || parts.kind !== 'card') return
        const t: Record<string, unknown> = { card: account }
        if (debug) {
          t.query = `${parts.issuer} ${parts.product}`
          t.expected_beancountName = parts.product
          try {
            const raw = (await kbHttp.resolve(`${parts.issuer} ${parts.product}`, {
              prefix: 'cc',
              limit: 4,
            })) as { items?: Array<{ slug: string }> }
            t.resolve_candidates = (raw.items ?? []).map((i) => i.slug)
            t.candidate_attrs = await Promise.all(
              (raw.items ?? []).slice(0, 4).map(async (i) => {
                const n = (await kbHttp.get(i.slug).catch((): null => null)) as {
                  attrs?: Record<string, unknown> | null
                } | null
                return { slug: i.slug, beancountName: n?.attrs?.beancountName ?? null }
              }),
            )
          } catch (e) {
            t.resolve_error = String(e)
          }
          trace.push(t)
        }
        try {
          const hit = await resolveHeldCard(kbHttp, parts.issuer, parts.product)
          if (debug) t.verified_slug = hit?.slug ?? null
          if (!hit) return
          const rel = (await kbHttp.related(hit.slug, {
            edge_type: 'EARNS_INTO',
            direction: 'outgoing',
          })) as { items?: Array<{ other: string; attrs?: Record<string, unknown> | null }> }
          const earns = (rel.items ?? []).filter((i) => i.other.startsWith('program/'))
          if (debug) t.earns_into = earns.map((e) => e.other)
          for (const e of earns) {
            // The earned commodity is the EARNS_INTO `currency` ticker; resolve it
            // to its currency node (exact, via the ticker registry) for the name +
            // beancountName hint.
            const ticker = typeof e.attrs?.currency === 'string' ? e.attrs.currency : null
            if (!ticker) continue
            const node = await resolveByTicker(kbHttp, ticker).catch((): null => null)
            const bn = node?.attrs?.beancountName
            const name =
              node?.display_name ??
              ticker
                .split('-')
                .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
                .join(' ')
            // Primary match: the user's account holding this COMMODITY
            // (ticker registry). Fallback: path-leaf === beancountName hint.
            const byTicker =
              typeof ticker === 'string' && ticker
                ? (accounts.find(
                    (a) =>
                      a.account.startsWith('Assets:Rewards:') &&
                      !isPending(a.account) &&
                      ((a as { currencies?: string[] }).currencies ?? []).includes(ticker),
                  )?.account ??
                  balRows.find(
                    (b) =>
                      b.account.startsWith('Assets:Rewards:') &&
                      !isPending(b.account) &&
                      b.currency === ticker,
                  )?.account ??
                  null)
                : null
            const byLeaf =
              typeof bn === 'string' && bn
                ? (accounts.find(
                    (a) =>
                      a.account.startsWith('Assets:Rewards:') &&
                      !isPending(a.account) &&
                      baseAccount(a.account).split(':').pop() === bn,
                  )?.account ?? null)
                : null
            const rewardsAccount = (byTicker ? baseAccount(byTicker) : null) ?? byLeaf
            if (!rewardsAccount) {
              links.push({
                card: account,
                rewards_account: null,
                rewards_name: name,
                rewards_currency: typeof ticker === 'string' ? ticker : null,
                rewards_balance: null,
              })
              break
            }
            let balance: number | null = null
            let currency: string | null = null
            if (rewardsAccount) {
              const rows = balRows.filter((b) => b.account === rewardsAccount)
              if (rows.length) {
                balance = rows.reduce((sum, b) => sum + Number(b.balance_scaled) / 10 ** b.scale, 0)
                currency = rows[0].currency
              } else {
                balance = 0
              }
            }
            links.push({
              card: account,
              rewards_account: rewardsAccount,
              rewards_name: name,
              rewards_currency: currency,
              rewards_balance: balance,
            })
            break // first earning currency is the card's programme
          }
        } catch {
          /* KG miss — no link for this card */
        }
      }),
    )
    return debug ? { links, trace } : { links }
  }

  // Per-card metadata for the Vault home tiles (owner ask): the associated
  // reward balance, uniform across points and cashback (we don't model that
  // split as first-class). The card earns into a pool (DENOMINATED_IN → a
  // reward currency) or, failing that, accrues into the issuer cashback
  // receivable. `reward_label` is the pool name or "Cashback"; balance/pending
  // are in `reward_unit` (a points ticker or a currency). Pool balances are
  // programme-wide (shared across a bank's cards) — surfaced per card by owner
  // decision, with the `:Pending` accrual called out separately.
  async cardMeta(): Promise<{
    cards: Array<{
      card: string
      issuer: string | null
      reward_label: string | null
      reward_account: string | null
      reward_balance: number | null
      reward_pending: number | null
      reward_unit: string | null
    }>
  }> {
    const ledger = this.ledgerStub()
    const [snapshot, balances] = await Promise.all([
      ledger.ledger_snapshot().catch((): null => null),
      ledger
        .query_sql('SELECT account, currency, scale, balance_scaled FROM balance_totals')
        .catch((): null => null),
    ])
    const accounts = (snapshot?.accounts ?? []) as ReadonlyArray<{ account: string }>
    const balRows = (balances?.rows ?? []) as Array<{
      account: string
      currency: string
      scale: number
      balance_scaled: number
    }>
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const balanceOf = (acct: string): number | null => {
      const rows = balRows.filter((b) => b.account === acct)
      if (!rows.length) return null
      return rows.reduce((s, b) => s + Number(b.balance_scaled) / 10 ** b.scale, 0)
    }

    const cards = accounts.filter((a) => a.account.startsWith('Liabilities:CreditCards:'))
    const out: Awaited<ReturnType<ConciergeDO['cardMeta']>>['cards'] = []
    await Promise.all(
      cards.map(async ({ account }) => {
        const parts = kgLookupParts(account)
        if (!parts || parts.kind !== 'card') return
        const issuer = parts.issuer ?? null

        let reward_label: string | null = null
        let reward_account: string | null = null
        let reward_balance: number | null = null
        let reward_pending: number | null = null
        let reward_unit: string | null = null

        // Points pool the card earns into (EARNS_INTO → a reward programme).
        try {
          const hit = await resolveHeldCard(kbHttp, parts.issuer, parts.product)
          if (hit) {
            const curRel = (await kbHttp
              .related(hit.slug, { edge_type: 'EARNS_INTO', direction: 'outgoing' })
              .catch((): null => null)) as {
              items?: Array<{ other: string; attrs?: Record<string, unknown> | null }>
            } | null
            const earn = curRel?.items?.find((o) => o.other.startsWith('program/'))
            if (earn) {
              // The earned commodity ticker is the EARNS_INTO `currency` attr;
              // resolve it to its currency node (exact ticker registry) for the label.
              const ticker = typeof earn.attrs?.currency === 'string' ? earn.attrs.currency : null
              const n = ticker ? await resolveByTicker(kbHttp, ticker).catch((): null => null) : null
              reward_label = n?.display_name ?? ticker ?? null
              // Friendly display unit — neutral "pts" for every reward currency
              // (no airline-vs-other guessing; the label already names it).
              reward_unit = 'pts'
              if (ticker) {
                // Match the ACTUAL ledger reward accounts by COMMODITY — the same
                // balances the Vault programmes list reads. No path
                // reconstruction, no Miles/Points guess (which diverged from the
                // real account and left the balance blank).
                const tk = ticker.toUpperCase()
                const isPending = (a: string) => /:Pending(?::|$)/.test(a)
                const rewardRows = balRows.filter(
                  (b) => b.account.startsWith('Assets:Rewards:') && b.currency.toUpperCase() === tk,
                )
                const sum = (rs: typeof rewardRows) =>
                  rs.reduce((s, b) => s + Number(b.balance_scaled) / 10 ** b.scale, 0)
                if (rewardRows.length) {
                  const posted = rewardRows.filter((b) => !isPending(b.account))
                  const pendingRows = rewardRows.filter((b) => isPending(b.account))
                  reward_account = (posted[0] ?? rewardRows[0]!).account
                  reward_balance = sum(posted)
                  const pend = sum(pendingRows)
                  // Only surface a real positive accrual — a tiny negative
                  // (rounding / reversed accrual) is noise, not "pending".
                  reward_pending = pend > 0 ? pend : null
                }
              }
            }
          }
        } catch {
          /* KG miss → reward stays null; the card still renders */
        }

        // No points pool → fall back to the issuer cashback receivable. Uniform
        // "reward balance" — we don't model cashback vs points as first-class.
        if (reward_account == null && issuer) {
          const receivable_account = `Assets:Receivable:${issuer}`
          const bal = balanceOf(receivable_account)
          if (bal != null) {
            reward_label = 'Cashback'
            reward_account = receivable_account
            reward_balance = bal
            reward_unit = 'INR'
          }
        }

        out.push({
          card: account,
          issuer,
          reward_label,
          reward_account,
          reward_balance,
          reward_pending,
          reward_unit,
        })
      }),
    )
    return { cards: out }
  }

  // Programme commodity → the tier-qualifying status-counter commodities that
  // QUALIFIES_TOWARD it (resolved from the KG). Lets the vault attach a
  // programme's status counters to its tile BY COMMODITY — counters now live as
  // their own tickers inside the programme's `Assets:Rewards:<X>` account (and in
  // legacy ledgers, a separate `Assets:Rewards:Status:*` account); commodity
  // matching is robust to either.
  async statusLinks(): Promise<{ links: Record<string, string[]> }> {
    const ledger = this.ledgerStub()
    const balances = await ledger
      .query_sql('SELECT DISTINCT account, currency FROM balance_totals')
      .catch((): null => null)
    const rows = (balances?.rows ?? []) as Array<{ account: string; currency: string }>
    const progCommodities = new Set<string>()
    for (const r of rows)
      if (/^Assets:Rewards:/.test(r.account) && !/^Assets:Rewards:Status:/.test(r.account))
        progCommodities.add(r.currency)
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const links: Record<string, string[]> = {}
    await Promise.all(
      [...progCommodities].map(async (commodity) => {
        try {
          // The ticker alias (currency/<ticker-lowercased>) lands on the canonical
          // programme currency node; kb_get follows it.
          const node = (await kbHttp
            .get(`currency/${commodity.toLowerCase()}`)
            .catch((): null => null)) as { slug?: string } | null
          if (!node?.slug) return
          const rel = (await kbHttp
            .related(node.slug, { edge_type: 'QUALIFIES_TOWARD', direction: 'incoming' })
            .catch((): null => null)) as { items?: Array<{ other: string }> } | null
          const counterSlugs = (rel?.items ?? [])
            .map((i) => i.other)
            .filter((o) => o.startsWith('currency/'))
          const tickers: string[] = []
          for (const cs of counterSlugs) {
            const cn = (await kbHttp.get(cs).catch((): null => null)) as {
              attrs?: Record<string, unknown> | null
            } | null
            const tk = typeof cn?.attrs?.ticker === 'string' ? cn.attrs.ticker : null
            if (tk) tickers.push(tk)
          }
          if (tickers.length) links[commodity] = tickers
        } catch {
          /* skip this programme — its tile still shows leaf-matched counters */
        }
      }),
    )
    return { links }
  }

  // Headless one-shot turn for text-only channels (Telegram, WhatsApp …):
  // the graph-walker's brain and read tools, minus everything interactive —
  // ask_user suspends, show_award_options is gen-UI, handoff needs the chat
  // loop. Stateless by design: each bot message is one self-contained turn,
  // separate from the web chat's history. RPC for the bot adapter workers.
  async answerText(question: string): Promise<{ text: string }> {
    const [snapshot, briefing] = await Promise.all([
      this.ledgerStub().ledger_snapshot(),
      fetchKbAgentsMd(this.KB_BASE, this.env.KB).catch(() => ''),
    ])
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const kb = makeKbTools(kbHttp)
    const ledger_snapshot = ledgerSnapshotTool(() => this.ledgerStub().ledger_snapshot())
    const query_sql = querySqlTool((sql, params) => this.ledgerStub().query_sql(sql, params))
    const codemode = createCodeTool({
      tools: { ...kb, ledger_snapshot, query_sql },
      executor: new DynamicWorkerExecutor({ loader: this.env.LOADER }),
    })
    const system =
      buildConciergeSystem(snapshot, briefing) +
      '\n\nChannel: plain-text chat (a messaging app). Reply concisely in plain text — no markdown tables, no in-app links. For questions about the user\'s own balances or history, use ledger_snapshot / query_sql.'
    const result = await generateText({
      model: this.buildModel({ id: CONCIERGE_MODEL_ID, reasoning: 'off' }),
      system,
      prompt: question,
      tools: { ...kb, ledger_snapshot, query_sql, codemode } as ToolSet,
      stopWhen: stepCountIs(10),
    })
    const text = result.text.trim()
    return { text: text || 'Sorry — I could not work out an answer to that.' }
  }

  // The single concierge tool surface. The model holds every read tool at the
  // top level for one-shot lookups, AND a `codemode` sandbox that exposes the
  // same tools (plus the library/util helpers) as methods — for any answer that
  // needs several dependent lookups or arithmetic, the model writes ONE program
  // instead of a back-and-forth.
  //
  // - `kb_resolve` / `kb_get` / `kb_related` / `kb_list`: the knowledge graph.
  // - `ledger_snapshot`: the user's account list. `query_sql`: read-only
  //   SELECT/WITH over the ledger.
  // - `codemode`: runs an LLM-written async JS program in a Dynamic Worker
  //   isolate; `sandboxTools` are exposed inside as `codemode.<name>(...)`.
  //   `sandboxTools` is the seam the util library grows on.
  // - `show_award_options`: gen-UI link to the /explore Award Explorer.
  // - `ask_user`: pure-text suspending tool — the user's next message answers.
  private conciergeTools(): ToolSet {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const kb = makeKbTools(kbHttp)
    const ledger_snapshot = ledgerSnapshotTool(() => this.ledgerStub().ledger_snapshot())
    const query_sql = querySqlTool((sql, params) => this.ledgerStub().query_sql(sql, params))
    const sandboxTools = { ...kb, ledger_snapshot, query_sql }
    const codemode = createCodeTool({
      tools: sandboxTools,
      executor: new DynamicWorkerExecutor({ loader: this.env.LOADER }),
    })
    return {
      ...kb,
      ledger_snapshot,
      query_sql,
      codemode,
      show_award_options: showAwardOptionsTool(),
      ask_user: askUserTool(),
    } as ToolSet
  }
}
