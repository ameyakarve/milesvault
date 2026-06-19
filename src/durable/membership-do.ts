import { DurableObject } from 'cloudflare:workers'

// Singleton Durable Object that mirrors the owner's YouTube channel membership
// roster so the login gate can answer "is this channelId a member?" in O(1)
// without touching the YouTube API on the hot path.
//
// Why a DO: its single-threadedness IS the concurrency primitive. Exactly ONE
// instance (idFromName('global')) owns the members.list cursor, so the
// `mode=updates` poll never races; a login spike collapses into ONE coalesced
// poll instead of N concurrent API calls (no thundering herd, no quota blowout).
//
// Quota shape (members.list = 2 units/call, channel daily quota = 10,000):
//   - 60s `updates` poll (fast grants)            ~2,880 units/day  (fixed)
//   - 1× daily `all_current` (removals + heal)    ceil(M/1000)×2    (rounding error)
//   - on-login pokes                              bounded by POKE_CEILING headroom
// All comfortably inside the free 10k/day. See docs/membership-gate-design.md.
//
// LLM-pipeline rule does NOT apply here — this is auth infrastructure, not the
// statement-ingest path; no model is involved.

const MEMBERS_URL = 'https://www.googleapis.com/youtube/v3/members'
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Poll cadence + budget knobs (mirror the design doc).
const UPDATES_INTERVAL_MS = 60_000 // fast-grant poll floor
const FULL_REFRESH_INTERVAL_MS = 24 * 60 * 60_000 // removal buffer (≤24h, acceptable)
const DEBOUNCE_MS = 5_000 // a just-synced checkNow re-reads the set, no new poll
const NEG_CACHE_MS = 10 * 60_000 // a confirmed non-member is cached this long
const POKE_CEILING = 9_000 // on-login pokes only spend headroom below the 10k cap
const UNITS_PER_CALL = 2 // members.list cost
const MAX_FULL_PAGES = 200 // safety cap (200k members) on a full refresh drain

type MemberItem = {
  snippet?: {
    memberDetails?: { channelId?: string; displayName?: string }
    membershipsDetails?: {
      highestAccessibleLevelDisplayName?: string
      membershipsDuration?: { memberSince?: string }
    }
  }
}
type MembersListResponse = { items?: MemberItem[]; nextPageToken?: string }

export type MembershipStatus = {
  hasCreatorToken: boolean
  members: number
  unitsToday: number
  unitsDay: string | null
  hasCursor: boolean
  lastUpdatesAt: number
  lastFullAt: number
  ownerChannelTitle: string | null
}

export class MembershipDO extends DurableObject<Cloudflare.Env> {
  // In-memory only (rebuilt on wake): coalesces concurrent pokes into one poll,
  // debounces, and negative-caches confirmed non-members.
  private inflightSync: Promise<void> | null = null
  private lastSyncAt = 0
  private negCache = new Map<string, number>()

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS members (
      channel_id TEXT PRIMARY KEY,
      level      TEXT,
      since      TEXT,
      updated_at INTEGER NOT NULL
    )`)
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT
    )`)
  }

  // ---- tiny kv over SQLite (cursor, tokens, units counter) ----

  private kvGet(k: string): string | null {
    const row = this.ctx.storage.sql.exec<{ v: string }>(`SELECT v FROM kv WHERE k=?`, k).toArray()[0]
    return row ? row.v : null
  }

  private kvSet(k: string, v: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
      k,
      v,
    )
  }

  // ---- units accounting (resets at UTC midnight) ----

  private utcDay(): string {
    const d = new Date()
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  }

  private unitsToday(): number {
    if (this.kvGet('units_day') !== this.utcDay()) return 0
    return Number(this.kvGet('units_today') ?? 0)
  }

  private addUnits(n: number): void {
    const cur = this.unitsToday() // handles day rollover → 0
    this.kvSet('units_day', this.utcDay())
    this.kvSet('units_today', String(cur + n))
  }

  // ---- member set ----

  private rowExists(channelId: string): boolean {
    return (
      this.ctx.storage.sql
        .exec(`SELECT 1 FROM members WHERE channel_id=? LIMIT 1`, channelId)
        .toArray().length > 0
    )
  }

  // Conditional upsert = a true DIFF: only writes a row when it's new or its
  // level/since actually changed, so a full refresh doesn't rewrite the whole
  // set every day (the one cost trap called out in the design doc). `IS NOT`
  // is null-safe.
  private upsertMember(it: MemberItem): string | null {
    const cid = it.snippet?.memberDetails?.channelId
    if (!cid) return null
    const level = it.snippet?.membershipsDetails?.highestAccessibleLevelDisplayName ?? null
    const since = it.snippet?.membershipsDetails?.membershipsDuration?.memberSince ?? null
    this.ctx.storage.sql.exec(
      `INSERT INTO members (channel_id, level, since, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET
         level=excluded.level, since=excluded.since, updated_at=excluded.updated_at
       WHERE members.level IS NOT excluded.level OR members.since IS NOT excluded.since`,
      cid,
      level,
      since,
      Date.now(),
    )
    return cid
  }

  // ---- creator OAuth token (owner, one-time grant; offline → refresh token) ----

  // Exchange the stored refresh token for a fresh access token, caching it until
  // ~1 min before expiry. Returns null if not bootstrapped or the refresh fails.
  private async getAccessToken(): Promise<string | null> {
    const now = Date.now()
    const cached = this.kvGet('access_token')
    const expiry = Number(this.kvGet('access_expiry') ?? 0)
    if (cached && expiry > now + 60_000) return cached
    const refresh = this.kvGet('refresh_token')
    if (!refresh) return null
    try {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.env.AUTH_GOOGLE_ID,
          client_secret: this.env.AUTH_GOOGLE_SECRET,
          refresh_token: refresh,
          grant_type: 'refresh_token',
        }),
      })
      if (!res.ok) {
        console.error('[membership] token refresh failed', res.status, await res.text().catch(() => ''))
        return null
      }
      const data = (await res.json()) as { access_token?: string; expires_in?: number }
      if (!data.access_token) return null
      this.kvSet('access_token', data.access_token)
      this.kvSet('access_expiry', String(now + (data.expires_in ?? 3600) * 1000))
      return data.access_token
    } catch (e) {
      console.error('[membership] token refresh error', String(e))
      return null
    }
  }

  // Owner bootstrap: store the creator refresh token, confirm the channel,
  // seed the roster (all_current) + start the updates stream, kick the poll.
  async connectCreator(refreshToken: string): Promise<{ ok: boolean; channelTitle: string | null }> {
    this.kvSet('refresh_token', refreshToken)
    // Force a fresh access token on next use.
    this.kvSet('access_token', '')
    this.kvSet('access_expiry', '0')
    const token = await this.getAccessToken()
    if (!token) return { ok: false, channelTitle: null }

    // Record the owner's channel title (nice for the status page; +1 unit once).
    let channelTitle: string | null = null
    try {
      const url = new URL(CHANNELS_URL)
      url.searchParams.set('part', 'snippet')
      url.searchParams.set('mine', 'true')
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      this.addUnits(1)
      if (res.ok) {
        const data = (await res.json()) as { items?: Array<{ snippet?: { title?: string } }> }
        channelTitle = data.items?.[0]?.snippet?.title ?? null
        if (channelTitle) this.kvSet('owner_channel_title', channelTitle)
      }
    } catch {
      /* title is cosmetic */
    }

    // Seed the roster, then open the updates stream (its first call returns
    // nothing — it just establishes the cursor baseline).
    await this.syncFull().catch((e) => console.error('[membership] bootstrap full failed', String(e)))
    await this.syncUpdates().catch((e) => console.error('[membership] bootstrap updates failed', String(e)))
    await this.ensureAlarm()
    return { ok: true, channelTitle }
  }

  // ---- the gate (read path) ----

  async isMember(channelId: string): Promise<boolean> {
    return !!channelId && this.rowExists(channelId)
  }

  // On-login instant check: allow from cache; else, if budget allows, run a
  // COALESCED updates poll and re-check; else defer (deny-for-now — the 60s
  // poll grants within ≤60s). Never maps logins 1:1 to API calls.
  async checkNow(channelId: string): Promise<boolean> {
    if (!channelId) return false
    if (this.rowExists(channelId)) return true
    if (!this.kvGet('refresh_token')) return false // not bootstrapped → can't prove membership

    const now = Date.now()
    const negExp = this.negCache.get(channelId)
    if (negExp && negExp > now) return false
    // Just synced — trust the set, don't spend another poll.
    if (now - this.lastSyncAt < DEBOUNCE_MS) {
      const ok = this.rowExists(channelId)
      if (!ok) this.negCache.set(channelId, now + NEG_CACHE_MS)
      return ok
    }
    // Budget tight → defer to the 60s poll.
    if (this.unitsToday() + UNITS_PER_CALL > POKE_CEILING) {
      this.negCache.set(channelId, now + NEG_CACHE_MS)
      return false
    }
    await this.runUpdatesCoalesced()
    const ok = this.rowExists(channelId)
    if (!ok) this.negCache.set(channelId, Date.now() + NEG_CACHE_MS)
    return ok
  }

  private async runUpdatesCoalesced(): Promise<void> {
    if (!this.inflightSync) {
      this.inflightSync = this.syncUpdates().finally(() => {
        this.inflightSync = null
      })
    }
    await this.inflightSync
  }

  // ---- sync paths (write) ----

  // mode=updates: only members who JOINED/UPGRADED since the cursor. The FIRST
  // call (no cursor) returns no members — it just establishes the baseline; we
  // store its nextPageToken and poll from there. Drains multiple pages if a
  // burst exceeds one page. Never reports removals (that's the daily full pass).
  private async syncUpdates(): Promise<void> {
    const token = await this.getAccessToken()
    if (!token) return
    let pageToken = this.kvGet('cursor') ?? undefined
    for (let page = 0; page < MAX_FULL_PAGES; page++) {
      const url = new URL(MEMBERS_URL)
      url.searchParams.set('part', 'snippet')
      url.searchParams.set('mode', 'updates')
      url.searchParams.set('maxResults', '1000')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      this.addUnits(UNITS_PER_CALL)
      if (!res.ok) {
        console.error('[membership] updates failed', res.status, await res.text().catch(() => ''))
        break
      }
      const data = (await res.json()) as MembersListResponse
      for (const it of data.items ?? []) this.upsertMember(it)
      if (data.nextPageToken) this.kvSet('cursor', data.nextPageToken)
      pageToken = data.nextPageToken
      // Caught up: no more changes / no further page.
      if (!data.nextPageToken || (data.items?.length ?? 0) === 0) break
    }
    this.kvSet('last_updates_at', String(Date.now()))
    this.lastSyncAt = Date.now()
  }

  // mode=all_current: ground truth. Upsert everyone seen (diffing), then PRUNE
  // anyone not seen (the removals the updates stream can't report). On a partial
  // failure we abort WITHOUT pruning — never drop members on a half-read roster.
  private async syncFull(): Promise<void> {
    const token = await this.getAccessToken()
    if (!token) return
    const seen = new Set<string>()
    let pageToken: string | undefined
    for (let page = 0; page < MAX_FULL_PAGES; page++) {
      const url = new URL(MEMBERS_URL)
      url.searchParams.set('part', 'snippet')
      url.searchParams.set('mode', 'all_current')
      url.searchParams.set('maxResults', '1000')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      this.addUnits(UNITS_PER_CALL)
      if (!res.ok) {
        console.error('[membership] full failed', res.status, await res.text().catch(() => ''))
        return // do NOT prune on a partial read
      }
      const data = (await res.json()) as MembersListResponse
      for (const it of data.items ?? []) {
        const cid = this.upsertMember(it)
        if (cid) seen.add(cid)
      }
      pageToken = data.nextPageToken
      if (!pageToken) break
    }
    // Prune removed members (diff: delete only what's gone), in chunks.
    const existing = this.ctx.storage.sql
      .exec<{ channel_id: string }>(`SELECT channel_id FROM members`)
      .toArray()
      .map((r) => r.channel_id)
    const toDelete = existing.filter((id) => !seen.has(id))
    for (let i = 0; i < toDelete.length; i += 100) {
      const chunk = toDelete.slice(i, i + 100)
      const placeholders = chunk.map(() => '?').join(',')
      this.ctx.storage.sql.exec(`DELETE FROM members WHERE channel_id IN (${placeholders})`, ...chunk)
    }
    this.kvSet('last_full_at', String(Date.now()))
    this.lastSyncAt = Date.now()
  }

  // ---- alarm: 60s self-rescheduling poll + daily full refresh ----

  async alarm(): Promise<void> {
    try {
      if (this.kvGet('refresh_token')) {
        await this.runUpdatesCoalesced().catch((e) =>
          console.error('[membership] alarm updates failed', String(e)),
        )
        if (Date.now() - Number(this.kvGet('last_full_at') ?? 0) >= FULL_REFRESH_INTERVAL_MS) {
          await this.syncFull().catch((e) => console.error('[membership] alarm full failed', String(e)))
        }
      }
    } finally {
      // Self-perpetuate only while bootstrapped — an un-bootstrapped DO goes
      // quiet (the alarm doesn't block hibernation, so this costs ~nothing).
      if (this.kvGet('refresh_token')) {
        await this.ctx.storage.setAlarm(Date.now() + UPDATES_INTERVAL_MS)
      }
    }
  }

  private async ensureAlarm(): Promise<void> {
    const cur = await this.ctx.storage.getAlarm()
    if (cur == null && this.kvGet('refresh_token')) {
      await this.ctx.storage.setAlarm(Date.now() + UPDATES_INTERVAL_MS)
    }
  }

  // Cron self-heal (daily): ensure the poll loop is alive if it ever stopped.
  async poke(): Promise<void> {
    await this.ensureAlarm()
  }

  // ---- owner debug ----

  async status(): Promise<MembershipStatus> {
    const count = this.ctx.storage.sql
      .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM members`)
      .toArray()[0]?.n
    return {
      hasCreatorToken: !!this.kvGet('refresh_token'),
      members: Number(count ?? 0),
      unitsToday: this.unitsToday(),
      unitsDay: this.kvGet('units_day'),
      hasCursor: !!this.kvGet('cursor'),
      lastUpdatesAt: Number(this.kvGet('last_updates_at') ?? 0),
      lastFullAt: Number(this.kvGet('last_full_at') ?? 0),
      ownerChannelTitle: this.kvGet('owner_channel_title'),
    }
  }
}
