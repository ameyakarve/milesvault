// Context window policy — decides how much of a thread's history the model sees
// each turn. A token-budget sliding window whose budget SHRINKS with idle time,
// so it unifies two concerns into one knob:
//   - idle reset: a stale thread gets a small budget, so old turns fall out.
//   - size cap:   even an ACTIVE thread is capped at the profile ceiling, so a
//     runaway conversation can't bloat cost / overflow context.
//
// The window is cut at USER-message boundaries (whole turns), so an assistant's
// tool-call/result pair is never split. It is recomputed FRESH each turn from the
// full history (no persisted floor), so returning to an active window ALWAYS
// restores full context — a prior stale-trim never "sticks" and starves a live
// conversation.
//
// GENERIC mechanism; the domain lives entirely in the PROFILES + which profile a
// surface selects. No card/reward/ledger specifics here.

import type { UIMessage } from 'ai'

export type ContextProfile = {
  name: string
  // Below this idle, treat as an active conversation: budget = ceiling.
  activeWindowMs: number
  // At/above this idle, treat as stale: budget = floor.
  staleAfterMs: number
  // Token budgets by band. ceiling is the hard cap enforced even when active.
  ceilingTokens: number // active band  (also the absolute max)
  idleTokens: number // activeWindow..staleAfter band
  floorTokens: number // >= staleAfter band
  // Never trim below this many trailing turns — even a stale reset keeps some
  // recent context rather than nuking to a single message.
  minKeepTurns: number
}

// Rough starting numbers — tune from the [ctx-policy] staging logs.
export const PROFILES = {
  // Concierge (web + Discord/WhatsApp) and the main (unscoped) editor.
  conversational: {
    name: 'conversational',
    activeWindowMs: 3 * 60 * 60_000, // 3 h — a follow-up within a few hours is still active
    staleAfterMs: 24 * 60 * 60_000, // 24 h
    ceilingTokens: 8_000,
    idleTokens: 6_000,
    floorTokens: 2_000,
    minKeepTurns: 5,
  },
  // Main (unscoped) editor. Turns are token-heavy — they carry draft_transaction
  // tool payloads (~4–5k tokens/turn observed) — so a higher ceiling than the
  // concierge, or you'd drop the previous exchange after barely one turn.
  editor: {
    name: 'editor',
    activeWindowMs: 3 * 60 * 60_000,
    staleAfterMs: 24 * 60 * 60_000,
    ceilingTokens: 24_000,
    idleTokens: 16_000,
    floorTokens: 6_000,
    minKeepTurns: 5,
  },
  // Scoped statement / inbox threads: big + long-lived, and their anchor (the
  // statement text via read_statement, drafts on the capture row) lives OUTSIDE
  // the message history — so trimming the discussion is safe. Relaxed everywhere,
  // long stale window; the floor only bites the pathological "hundreds of turns
  // on one item" case.
  document: {
    name: 'document',
    activeWindowMs: 3 * 60 * 60_000,
    staleAfterMs: 14 * 24 * 60 * 60_000, // 14 d
    ceilingTokens: 32_000,
    idleTokens: 24_000,
    floorTokens: 8_000,
    minKeepTurns: 5,
  },
} satisfies Record<string, ContextProfile>

const CHARS_PER_TOKEN = 4

export function estimateTokens(m: UIMessage): number {
  let chars = 0
  for (const part of m.parts ?? []) chars += JSON.stringify(part).length
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

export type Band = 'active' | 'idle' | 'stale'

export function bandFor(profile: ContextProfile, idleMs: number): Band {
  if (idleMs < profile.activeWindowMs) return 'active'
  if (idleMs < profile.staleAfterMs) return 'idle'
  return 'stale'
}

export function budgetFor(profile: ContextProfile, idleMs: number): number {
  const band = bandFor(profile, idleMs)
  return band === 'active'
    ? profile.ceilingTokens
    : band === 'idle'
      ? profile.idleTokens
      : profile.floorTokens
}

export type WindowResult = {
  kept: UIMessage[]
  droppedTurns: number
  droppedMessages: number
  tokensBefore: number
  tokensAfter: number
  budget: number
  band: Band
}

// Recompute the window FRESH from the full history each turn: keep the most
// recent whole turns that fit the idle-scaled budget, never dropping below the
// profile's minKeepTurns trailing turns. No persisted floor — so an active turn
// always restores full context regardless of any earlier stale-trim.
export function windowMessages(
  messages: UIMessage[],
  profile: ContextProfile,
  idleMs: number,
): WindowResult {
  const band = bandFor(profile, idleMs)
  const budget = budgetFor(profile, idleMs)
  const perMsg = messages.map(estimateTokens)
  const suffixTokens = (from: number): number => {
    let t = 0
    for (let i = from; i < messages.length; i++) t += perMsg[i]!
    return t
  }
  const tokensBefore = suffixTokens(0)
  // Turn boundaries = indices of user messages (a turn starts at the user's msg).
  const turnStarts: number[] = []
  messages.forEach((m, i) => {
    if (m.role === 'user') turnStarts.push(i)
  })
  // No user turns (edge): keep everything.
  if (turnStarts.length === 0) {
    return {
      kept: messages,
      droppedTurns: 0,
      droppedMessages: 0,
      tokensBefore,
      tokensAfter: tokensBefore,
      budget,
      band,
    }
  }
  // Advance a whole turn at a time until under budget, but never drop below the
  // profile's minKeepTurns trailing turns (so we never nuke to a single message).
  const minKeep = Math.max(1, profile.minKeepTurns)
  let si = 0
  while (si < turnStarts.length - minKeep && suffixTokens(turnStarts[si]!) > budget) si++
  // When NOT trimming, keep from the very start (index 0) so leading assistant /
  // injected messages that precede the first user turn are retained — e.g. the
  // ingest's draft_transaction card, which anchors an inbox thread. Only cut at a
  // user-message boundary when we're actually dropping older turns (si > 0).
  const start = si === 0 ? 0 : turnStarts[si]!
  const kept = messages.slice(start)
  return {
    kept,
    droppedTurns: si,
    droppedMessages: start,
    tokensBefore,
    tokensAfter: suffixTokens(start),
    budget,
    band,
  }
}
