# Agent Registries & Handoff — Design

Native multi-agent handoff on `@cloudflare/think`. One live conversation thread, control passed between specialized agents. Generalized to **per-use-case registries** (editor vs concierge) so different product surfaces get different agent rosters without forking the runtime.

## Why

Today everything funnels through a single `LedgerDO` persona: one `getSystemPrompt()`, one tool set, one model. Statement extraction is bolted on as a `process_statement` tool that dispatches to a worker DO and pushes a result back — the worker never talks to the user, so it can't clarify mid-extraction. As we add surfaces (concierge, analyst, onboarding) the single prompt becomes a junk drawer: every instruction, every tool, every example competes for the same context window, and the model picks wrong.

We want: the main agent recognizes intent ("extract this statement"), **hands the live conversation to a statement agent**, which carries its own prompt/tools/model and can run `clarify` directly against the user. When done it stays active for same-domain follow-ups; an off-domain turn hands back (or to a sibling).

This is the OpenAI-Swarm shape, but we **do not adopt a framework** — Think already gives us every primitive (per-turn config swap, durable state, suspendable client tools). See "Build vs adopt" below.

## Core mechanism (verified feasible on Think v0.7.1)

Think calls `getModel()` / `getSystemPrompt()` / `getTools()` **every turn**, and `beforeTurn(ctx): TurnConfig` can override `{model, system, tools, activeTools, toolChoice, maxSteps}` for that turn. `configure<T>()` / `getConfig<T>()` persist JSON to the DO's `think_config` SQLite table (survives eviction).

Handoff is then ~state + a tool:

```ts
// persisted, survives eviction
type AgentState = { activeAgent: string; handoffContext?: string }

beforeTurn(ctx): TurnConfig {
  const { activeAgent } = this.getConfig<AgentState>()
  const agent = this.registry[activeAgent] ?? this.registry[this.registry.entry]
  return {
    system: agent.system(this.snapshot),
    tools: agent.tools(this),
    model: agent.model(this.env),
    activeTools: agent.activeTools,
  }
}
```

The `handoff` tool has an `execute` (server tool, no suspension) that flips `activeAgent` **and carries context forward** to the next agent, then lets the loop continue — the next turn renders under the new persona:

```ts
handoff: tool({
  description: 'Transfer the conversation to a specialist agent.',
  inputSchema: z.object({
    to: z.enum(targets),
    context: z.string(),   // the overall context the next agent needs to continue
  }),
  execute: async ({ to, context }) => {
    this.configure<AgentState>({ activeAgent: to, handoffContext: context })
    return { handed_off_to: to }   // becomes a tool-result; loop re-runs beforeTurn
  },
}),
```

Agents are **fully independent** — they do not share a prompt body. The originating agent hands forward exactly the context the next agent needs (`context`); the receiving agent reads `handoffContext` and folds it into its first turn rather than reconstructing state. The only thing common across agents is the handoff mechanism itself.

No coroutine, no runner library. The turn-driven loop + DO SQLite is the durable state machine. This is the part the external libs would replace — and it's the part we already own.

## Registry abstraction

A **registry** = a named roster of agents + a handoff graph + an entry agent. One registry per use-case surface.

```ts
type AgentDef = {
  name: string
  system: (snapshot: Snapshot) => string
  tools: (host: Think) => ToolSet
  model: (env: Env) => LanguageModel
  activeTools?: string[]
  canHandoffTo: string[]            // edges in the handoff graph
}

type Registry = {
  name: string                      // 'editor' | 'concierge'
  entry: string                     // activeAgent default
  agents: Record<string, AgentDef>
}
```

- **`editor` registry** — the existing `/editor` surface. Agents: `ledger` (entry; freeform Beancount edits, the current LedgerDO persona), `statement` (extraction + its own `clarify`). Graph: `ledger ↔ statement`.
- **`concierge` registry** — a later, lighter surface: **text-only, mostly read-only, no editor functionality**. Net-new, comes after the editor work. Thin placeholder roster: `triage` (entry; intent routing + small talk) + `analyst` (read-only Q&A), reusing the shared `statement` def only if needed. Graph: `triage → analyst`, `analyst → triage`. Not in the editor critical path; its full product spec is deferred.

`statement` is a **shared `AgentDef`** imported into both registries — the roster is composition, not inheritance. Which registry a DO uses is fixed at construction (a constructor arg / config row), not switched at runtime: a DO instance serves one surface.

```
src/durable/agents/
  defs/
    ledger.ts          AgentDef
    statement.ts       AgentDef (shared)
    analyst.ts         AgentDef
    triage.ts          AgentDef
  registries/
    editor.ts          Registry { ledger, statement }
    concierge.ts       Registry { triage, analyst }   (later)
  handoff.ts           the handoff tool factory (targets from canHandoffTo)
  runtime.ts           beforeTurn glue, mixed into the Think subclass
```

## Handoff semantics

- **Entry.** A fresh session starts at `registry.entry`. `activeAgent` is read from config, defaulting to entry.
- **Targets are graph-constrained.** The `handoff` tool's enum is `registry.agents[activeAgent].canHandoffTo` — an agent can only hand off along its declared edges. Keeps the model from teleporting to an agent that can't serve the surface.
- **Specialist completion ≠ automatic handback.** When `statement` finishes, it stays active. The *next* user turn is still its turn. Only when the model itself decides the turn is off-domain does it call `handoff` (typically back to entry). This matches the user's stated intent: "If the next qn is to the same agent, then good. Else handoff."
- **Clarify lives on the specialist.** `statement.tools` includes the existing `clarify` client tool (no `execute` → suspends, client answers, loop resumes). The specialist owns the whole extract→clarify→finish arc on the live thread — no cross-DO push-back needed for the conversational path.
- **One handoff per user turn (cap = 1).** A handoff flips `activeAgent` and ends routing for that turn; the next turn runs under the new persona. The model cannot chain `A → B → C` inside a single user turn (prevents mis-routing ping-pong, bounds token spend). Enforced with a per-turn counter / `maxSteps`. Revisit if a `triage`-style hub later needs a legit 2-hop route.
- **One thread, visible seam.** Messages after a handoff carry an agent chip so the user sees who's speaking — but it's one rolling thread, no tab switch, no new DO. Requires a new message-part type that `useAgentChat` and the chat UI render.

## Where the hard logic lives

Handoff routes *conversation*; it does not make extraction correct. Two pieces stay deterministic / data-driven and are **owned by the `statement` agent**, not by prompt phrasing:

- **Forex pairing → code.** Markup = 2% of a charge's INR; GST = 18% of markup; ElevenLabs-style DCC is the labeled exception. The statement layout is adversarial (fee rows unnamed, out of order, cross-page, GST sometimes precedes its charge), so only arithmetic reliably pairs a fee to its charge. This is a deterministic post-pass over the model's raw extraction, **not** a prompt rule. ("Totals reconcile" is a mirage — money conserves while pairing is wrong.)
- **Categorization → pre-defined categories + open override + clarify.** Ship a fixed category vocabulary in the `statement` prompt (the DICT we already evaluated). Model picks the closest; a catch-all exists; genuine ambiguity routes through the agent's own `clarify` tool instead of a silent guess. No free-text taxonomy drift.

The registry/handoff layer is deliberately ignorant of both — it just makes sure the `statement` agent is the one holding the conversation when they run.

## Migration from today's LedgerDO

Additive, no big-bang rewrite:

1. **Extract the current persona into `defs/ledger.ts`** verbatim — `getSystemPrompt`/`getTools`/`getModel` become `ledger.system/tools/model`. Behavior-preserving.
2. **Introduce the registry + `beforeTurn` glue** in `LedgerDO` with a single-agent `editor` registry containing only `ledger`. Still behaves exactly as today (one persona, no handoff tool yet). Ship & verify parity.
3. **Add `statement` as a second agent** + the `handoff` tool. The `statement` agent *owns the conversation* after a handoff: it drives `process_statement`, clarifies, and drafts, then hands back to `ledger`. Extraction itself stays on the `StatementExtractorDO` worker — the statement bytes must never enter the conversation (they're held server-side behind a `<statement id=… />` reference), so the agent dispatches to the worker rather than extracting in-thread. What moves is *conversational ownership*, not the extraction compute.
4. **Land the forex post-pass and category vocab** inside `statement` (independent of 1–3; can land earlier).
5. **Concierge registry** is a later, separate surface — text-only, mostly read-only, no editor functionality. New route, new DO instance bound to the `concierge` registry. Deferred until after the editor work; full product spec TBD.

Each step is a shippable PR with staging parity checks.

## Build vs adopt

- **`@openai/agents`** — owns the runner loop and session memory, OpenAI-provider-centric, Node-runtime assumptions risky on Workers. Adopting it means ripping out Think's turn loop and DO-backed durability — the exact things that make this work on Cloudflare.
- **`@ai-sdk/swarm`** — experimental, also drives the loop itself; same conflict, less maturity.
- **Native** — handoff is `configure()` + one tool + a `beforeTurn` switch (~tens of lines). We keep Think's eviction-survival, client-tool suspension, and `useAgentChat` wiring untouched.

The specialized, hard-to-replace parts (DO durability, suspendable client tools, the Next-on-Workers WebSocket bridge) are ours already; the part a framework would add (a routing loop) is the cheap part. Build native.

## Settled decisions

- **Concierge** — text-only, mostly read-only, no editor functionality, built later. Thin `triage + analyst` placeholder for now; full product spec deferred.
- **Visible seam** — handoff is shown to the user via a per-agent chip; needs a new message-part type for `useAgentChat` + the chat UI.
- **Independent prompts + context handoff** — agents do NOT share a prompt body; the only common bit is the handoff mechanism. The originating agent passes the necessary overall context forward in the `handoff` call (`handoffContext`); we accept the prefill cache miss on the post-handoff turn (handoffs are rare vs. total turns).
- **Cap handoffs at 1 per user turn** — no `A → B → C` chaining within a single turn; enforced via a counter / `maxSteps`.

## Remaining open questions

- **Concierge product spec** — route, intent set, read-only tool surface. Deferred, not blocking.
- **Multi-hop revisit** — if `triage` later needs a genuine 2-hop route, lift the cap for that registry only.
```
