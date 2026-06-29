# Patches

Local `pnpm patch` overrides on third-party deps. Each patch should be either
upstreamed or eliminated as soon as feasible — track each one with a
`TODO(upstream-…)` comment at its call site so the reconciliation work surfaces
when the relevant code is touched.

Patches are auto-applied on `pnpm install` (see `patchedDependencies` in
`package.json`).

## `@cloudflare__think@0.11.1.patch`

**What it does**: adds a `repairToolCall?` field to `TurnConfig` and forwards
it to the underlying `streamText({ experimental_repairToolCall })` call in
`_runInferenceLoop`. ~3 lines. (Re-anchored from the original `0.7.1` patch when
we upgraded the agents SDK for messengers — `TurnConfig` moved into the bundled
`dist/index-*.d.ts` chunk and the `streamText` call gained `experimental_transform`,
but the field is still not exposed natively, so the patch is still required.)

**Why it exists**: the AI SDK ships
`experimental_repairToolCall` — a hook that fires when a tool call fails input
validation and lets us either programmatically fix the input or do a focused
sub-call to the model to repair it. `@cloudflare/think`'s `TurnConfig`
exposes ~20 streamText options but not this one, so the hook is unreachable
without a patch.

We use it to repair the forex-rounding class of `draft_transaction` failures
(LLMs round off by ₹0.01 on `@@`-priced INR statements and can't fix it on
retry). Without repair, refine errors loop the model until it gives up and
narrates the transactions as a markdown code block instead of tool-calling.

**Where it's wired in**:
- `src/durable/chat-do.ts` — `draftTransactionRepair` (the callback) +
  `activeAgentConfig().repairToolCall` (returned from `beforeTurn`/`beforeStep`).
- `src/lib/beancount/repair-draft-batch.ts` — the snap logic itself.

**How to reconcile**:
1. File / link a PR upstream at github.com/cloudflare/agents to add this same
   pass-through in `TurnConfig`. The patch in this directory is the diff.
2. When upstream releases a `@cloudflare/think` version that exposes the
   field, bump our dep, delete this patch file, and remove the corresponding
   `patches/` entry from `package.json`'s `patchedDependencies`.
3. If upstream picks a different name for the field, rename
   `activeAgentConfig().repairToolCall` in `chat-do.ts` (single call site).
4. Drop this README section.

The `draftTransactionRepair` callback and the snap module remain useful
regardless — they're our own application logic, not framework plumbing.
