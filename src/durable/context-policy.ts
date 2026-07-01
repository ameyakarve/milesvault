// Context window policy — decides how much of a thread's history the model sees
// each turn. A token-budget sliding window whose budget SHRINKS with idle time,
// so it unifies two concerns into one knob:
//   - idle reset: a stale thread gets a small budget, so old turns fall out (a
//     "fresh start" that persists — the floor only advances).
//   - size cap:   even an ACTIVE thread is capped at the profile ceiling, so a
//     runaway conversation can't bloat cost / overflow context.
//
// The window is cut at USER-message boundaries (whole turns), so an assistant's
// tool-call/result pair is never split. The floor (first kept message id) only
// advances, so a trim/reset sticks across subsequent turns instead of snapping
// back the moment the user is "active" again.
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
}

// Rough starting numbers — tune from the [ctx-policy] staging logs.
export const PROFILES = {
  // Concierge (web + Discord/WhatsApp) and the main (unscoped) editor.
  conversational: {
    name: 'conversational',
    activeWindowMs: 10 * 60_000, // 10 min
    staleAfterMs: 24 * 60 * 60_000, // 24 h
    ceilingTokens: 8_000,
    idleTokens: 4_000,
    floorTokens: 2_000,
  },
  // Scoped statement / inbox threads: big + long-lived, and their anchor (the
  // statement text via read_statement, drafts on the capture row) lives OUTSIDE
  // the message history — so trimming the discussion is safe. Relaxed everywhere,
  // long stale window; the floor only bites the pathological "hundreds of turns
  // on one item" case.
  document: {
    name: 'document',
    activeWindowMs: 10 * 60_000,
    staleAfterMs: 14 * 24 * 60 * 60_000, // 14 d
    ceilingTokens: 32_000,
    idleTokens: 24_000,
    floorTokens: 8_000,
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
  floorId: string | null
  droppedTurns: number
  droppedMessages: number
  tokensBefore: number
  tokensAfter: number
  budget: number
  band: Band
}

// Slide the floor forward — a whole user-turn at a time — until the kept window
// fits the idle-scaled budget, never dropping the final (current) turn. Starts
// from the persisted floor id, so the window only ever shrinks/advances.
export function windowMessages(
  messages: UIMessage[],
  profile: ContextProfile,
  idleMs: number,
  floorId: string | null,
): WindowResult {
  const band = bandFor(profile, idleMs)
  const budget = budgetFor(profile, idleMs)
  const perMsg = messages.map(estimateTokens)
  const suffixTokens = (from: number): number => {
    let t = 0
    for (let i = from; i < messages.length; i++) t += perMsg[i]!
    return t
  }
  // Turn boundaries = indices of user messages (a turn starts at the user's msg).
  const turnStarts: number[] = []
  messages.forEach((m, i) => {
    if (m.role === 'user') turnStarts.push(i)
  })
  // No user turns (edge): keep everything.
  if (turnStarts.length === 0) {
    return {
      kept: messages,
      floorId: messages[0]?.id ?? null,
      droppedTurns: 0,
      droppedMessages: 0,
      tokensBefore: suffixTokens(0),
      tokensAfter: suffixTokens(0),
      budget,
      band,
    }
  }
  // Initial floor position: the persisted floor id (monotonic), else the start.
  let si = 0
  if (floorId) {
    const at = turnStarts.findIndex((idx) => messages[idx]!.id === floorId)
    if (at >= 0) si = at
  }
  const tokensBefore = suffixTokens(turnStarts[si]!)
  // Advance a whole turn at a time until under budget, but always keep the last.
  while (si < turnStarts.length - 1 && suffixTokens(turnStarts[si]!) > budget) si++
  const start = turnStarts[si]!
  const kept = messages.slice(start)
  return {
    kept,
    floorId: messages[start]?.id ?? null,
    droppedTurns: si,
    droppedMessages: start,
    tokensBefore,
    tokensAfter: suffixTokens(start),
    budget,
    band,
  }
}
