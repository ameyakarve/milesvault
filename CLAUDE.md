# MilesVault — Claude Code instructions

## Stack

Next.js 15 App Router on Cloudflare Workers via `@opennextjs/cloudflare`. Auth is `next-auth` with Google OAuth. Per-user state lives in a `LedgerDO` Durable Object (SQLite). Read-only ledger API under `src/app/api/ledger/v2/`.

## Environment

- D1 database: `c5e6c9e1-6020-4772-a568-714a57e0bf0f` (bound, currently unused by app code)
- Cloudflare account: `e0bc1f55dc6fc3f8fe870087199a2ee3`
- Production worker: `milesvault` → milesvault.com
- Staging worker: `milesvault-staging` → staging.milesvault.com
- Deploy: push to `main` → GitHub Actions auto-deploys staging via `pnpm run deploy`. Production deploy is manual (`workflow_dispatch`).
- Push with `env -u GH_TOKEN git push` (fine-grained PAT lacks repo access; gh keyring token does).

## Working rules

- **Never make architectural changes without explicit authorization.** Do not swap out a library for a hand-written equivalent, replace a chosen editor/framework, restructure data flow, or rip out a non-trivial dependency on your own. If a task that's described in UI/visual terms ("make X pixel perfect", "tweak the design") seems to require an architectural change to land, stop and ask first. The default is to preserve the existing architecture.

- **NEVER put the owner's real data into prompts, the KG, examples, tests, commit messages, or ANY committed file.** The owner's statements are private: card numbers, real merchant names, flight numbers / routes / dates, amounts, points balances, account names, passwords. Prompt fragments (`src/durable/agent-prompt/*.md`), KG content (`~/milesvault-kg`), code-level examples (e.g. validation-feedback strings), and tests MUST use SYNTHETIC, obviously-fictional placeholders only — generic merchants, round illustrative numbers, `<Placeholder>` tokens — mirroring the existing synthetic style in `examples.md`. When you need an example, INVENT one; never copy a value from the user's actual transaction or paste. Real statements live ONLY under `/tmp/verify` (outside the repo) and are never committed. (Owner decree — repeatedly violated; before writing any example into a tracked file, check that every number/name/route in it is invented, not the user's.)

- **Keep generic tools/mechanisms GENERIC; inject domain specifics at construction; let the MODEL make the judgement call.** A reusable tool (`clarify`, the draft-validation feedback, etc.) must describe only HOW it works — no card / bank / reward / redemption specifics, no forced formats baked into its core. Domain-specific guidance (when to ask, which choices are ambiguous, what to draft) is passed IN when the tool/agent is constructed, or lives in the prompt/KG — never hard-coded into the generic mechanism. Describe capabilities and let the model decide how to apply them (e.g. "your question renders as markdown — format it when it helps"), do NOT prescribe/force a specific output. (Owner decree — repeatedly violated by leaking domain detail and forcing behavior into generic surfaces.)

- **The statement-ingest pipeline is LLM-FIRST. Do NOT add arbiter / heuristic / matching code to it. (Owner decree — already cleaned up twice; a third regression is unacceptable.)** This covers `src/durable/ingest/pipeline.ts`, the `src/durable/agent-prompt/*.md` prompts, and the `~/milesvault-kg` card guides. The MODEL makes every judgment: which card the statement is, which reward guide/pool applies, expense categories, matching transactions to the user's existing accounts, points math, balances. Code in this path does ONLY two mechanical things: **(1)** generic, currency-agnostic validation (parse, per-currency balance, account-shape) that bounces invalid drafts back to the model, and **(2)** serialization. **Banned outright:** token-overlap or name matching, name-cleaning resolvers, per-card / per-bank special-casing, "if the model got X wrong, guess Y in code", any arbiter that second-guesses or post-processes the model's choices. When the model is wrong, fix the **PROMPT** or the **KG** — never code. The moment you feel the urge to write resolution / matching / decision code here, STOP: that urge IS the mistake. Re-read this rule and move the logic into the prompt or KG.
