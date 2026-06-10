# Assistant merge — implementation options (decision needed)

Status: **proposed, needs an owner call.** Executes `experience.md` §7 ("One
Assistant" / "one brain, capability-aware channels"). The *what* is decided —
one entry point, the user never picks a brain, gen-UI degrades to a text
protocol for bot channels. This note decides the *where*: which DO hosts the
brains.

## Current state

| Surface | DO | Agents | Notes |
|---|---|---|---|
| `/editor` chat | `ChatDO` | `ledger` ↔ `statement` | gen-UI: draft/clarify cards, statement uploads |
| `/concierge` | `ConciergeDO` | `graph-walker` ↔ `analyst` | KB tools, codemode sandbox, ask_user |

Handoffs work *within* a DO's registry; there is no cross-DO handoff.

## Options

**A. ChatDO hosts all four agents (recommended).**
The concierge agents' tools are already shared modules
(`src/durable/agents/tools/concierge/*`), and ChatDO already has the `KB`
service binding (it uses `kbHttpOverFetch` for account-name lookups) and the
worker env carries `LOADER` for codemode. Move `graph-walker` + `analyst`
into the `editor` registry, extend the handoff graph, and make the entry
agent a cheap router (or extend `ledger`'s handoff targets — likely enough,
since handoff is how routing already happens). `ConciergeDO` **stays** as the
data layer: award-engine RPCs, route cache, airport store keep serving
`/explore`, `/points`, `/status-match` — only its *chat* moves out.
`/concierge` then redirects into the assistant.
- Cost: registry wiring + prompt adjustments + one DO holding longer mixed
  histories. No new bindings, no data migration.
- Risk: low — agents and tools are unchanged; only the registry/handoff
  topology changes.

**B. Cross-DO routing (front agent proxies to ConciergeDO).**
Keep both DOs and add either a router that forwards turns or cross-DO
handoff support to the agent framework. Rejected: builds framework machinery
(streaming proxy, split history, two sockets) to preserve a split that has no
data-locality reason — the concierge agents' state is conversation state, not
ConciergeDO's SQLite.

**C. UI-only unification (one panel, user-invisible tab switch).**
One surface that silently swaps between the two sockets by classifying the
user's message client-side. Rejected: the classification belongs to the
agents (handoff), not a client heuristic; mid-conversation brain switches
lose context exactly when the user mixes concerns ("can I afford this?" after
logging a statement).

## Bot-channel fit (experience.md §7, Channels)

Option A composes cleanly: the bot adapter talks to the same ChatDO entry
with a `channel: 'text'` capability envelope; tools render text-protocol
equivalents (reply-to-approve) instead of gen-UI. Until the merge lands, a
read-only bot can still ship against ConciergeDO's chat as-is — the merge
moves its home later without changing the bot protocol.

## Decision needed

Bless option A (or amend). On approval the sequence is: extend the `editor`
registry + handoff graph → context injection from the active screen → fold
`/concierge` into the assistant surface → persistent panel/Cmd+K shell.
