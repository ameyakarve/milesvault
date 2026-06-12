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

- **The statement-ingest pipeline is LLM-FIRST. Do NOT add arbiter / heuristic / matching code to it. (Owner decree — already cleaned up twice; a third regression is unacceptable.)** This covers `src/durable/ingest/pipeline.ts`, the `src/durable/agent-prompt/*.md` prompts, and the `~/milesvault-kg` card guides. The MODEL makes every judgment: which card the statement is, which reward guide/pool applies, expense categories, matching transactions to the user's existing accounts, points math, balances. Code in this path does ONLY two mechanical things: **(1)** generic, currency-agnostic validation (parse, per-currency balance, account-shape) that bounces invalid drafts back to the model, and **(2)** serialization. **Banned outright:** token-overlap or name matching, name-cleaning resolvers, per-card / per-bank special-casing, "if the model got X wrong, guess Y in code", any arbiter that second-guesses or post-processes the model's choices. When the model is wrong, fix the **PROMPT** or the **KG** — never code. The moment you feel the urge to write resolution / matching / decision code here, STOP: that urge IS the mistake. Re-read this rule and move the logic into the prompt or KG.
