import type { MembershipDO } from '@/durable/membership-do'

// The membership roster is a single global Durable Object — one cursor, one
// poll loop, one source of truth for the whole worker.
const MEMBERSHIP_SINGLETON = 'global'

export function membershipStub(env: Cloudflare.Env): DurableObjectStub<MembershipDO> {
  const ns = env.MEMBERSHIP_DO as unknown as DurableObjectNamespace<MembershipDO>
  return ns.get(ns.idFromName(MEMBERSHIP_SINGLETON))
}

// The allowlist (ALLOWED_EMAILS) is the human safety hatch: these emails always
// log in regardless of the membership gate, so the owner can never be locked out
// and can bootstrap the creator token. Empty list → no allowlist entries.
export function allowedEmails(env: Cloudflare.Env): string[] {
  return (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// The channel owner = the first ALLOWED_EMAILS entry. Only this account may run
// the creator-token OAuth bootstrap (their token is the one whose channel's
// members we list — anyone else's token would silently list the WRONG channel).
export function ownerEmail(env: Cloudflare.Env): string | null {
  return allowedEmails(env)[0] ?? null
}

// The membership gate is OFF until this flag is "1". Off = login behaves exactly
// as before (ALLOWED_EMAILS only); membership is never consulted and no YouTube
// quota is spent. Flip to "1" (per env) once the creator token is bootstrapped.
export function membershipGateEnabled(env: Cloudflare.Env): boolean {
  return (env as { MEMBERSHIP_GATE?: string }).MEMBERSHIP_GATE === '1'
}
