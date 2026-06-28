# MilesVault evals

Three eval families, all built on [promptfoo](https://promptfoo.dev). Each one
runs **one real agent turn** on the deployed staging worker (real gemma model,
real system prompt, real read tools; the write/interactive tools are captured,
not applied), then grades the result: structural checks are inline `javascript`
assertions over the turn's JSON, and correctness is an `llm-rubric` judged by a
**stronger** model (llama via Workers AI, served by `/api/test/judge` — gemma
can't grade itself, and this keeps the eval self-contained, no OpenAI key).

| Eval | Agent | Config | Run with |
|------|-------|--------|----------|
| **Editor** | `/editor` ledger drafting | `evals/promptfooconfig.yaml` | `pnpm eval` |
| **Concierge** | KG + ledger Q&A (`/points`, inline facts) | `evals/concierge-bench.yaml` | `npx promptfoo eval -c evals/concierge-bench.yaml --no-cache -j 1` |
| **Statement ingest** | statement → drafts (real statements only) | `~/milesvault-verify/statements-real.yaml` | `npx promptfoo eval -c ~/milesvault-verify/statements-real.yaml --no-cache -j 1` |

Only the editor suite has a package alias (`pnpm eval`); the others are run by
pointing `promptfoo` straight at their config — deliberately, so the
real-statement suite (which reads private files outside the repo) is never wired
into a committed script.

## Prerequisites (all suites)

`TEST_USER_TOKEN` must be set — the test-user cookie secret that gates the
`/api/test/*` endpoints. It lives in `.dev.vars`:

```sh
export TEST_USER_TOKEN=$(grep '^TEST_USER_TOKEN=' .dev.vars | cut -d= -f2-)
```

A single `promptfoo` run is **serial** (`-j 1`) — one process shares one test
ledger, so concurrent cases in it would clobber each other's seed — and uses
`--no-cache`, so each run re-hits the live (non-deterministic) model. View any
run's results UI with `pnpm eval:view`. To run cases **in parallel**, use the
multi-account runner below.

## Running in parallel (multi-account lanes)

A Durable Object is single-threaded, so one test identity (`email`) = one
concurrent eval. The runner fans a suite across **N test accounts**, each its own
serial DO lane:

```sh
export TEST_USER_TOKEN=$(grep '^TEST_USER_TOKEN=' .dev.vars | cut -d= -f2-)
node evals/run-parallel.mjs evals/concierge-bench.yaml 4   # 4 accounts
```

It shards the config's `tests` into N contiguous ranges (`--filter-range`) and
spawns one `promptfoo` process per account, each pinned via `MV_TEST_ACCOUNT=k`
→ the `mv-test-account` cookie → `test+k@milesvault.test` → that account's own
ledger + agent DOs. None of the evals mutate the ledger (drafts are captured), so
the accounts are interchangeable lanes; results are merged at the end (per-account
JSON paths are printed). **N is bounded by Workers AI throughput, not the ledger
— keep it ~4–6 or gemma starts returning 429s.** Account `0`/unset is the
canonical `test@milesvault.test`, so plain `pnpm eval` is unaffected.

---

## 1. Editor eval

End-to-end behavior eval for the `/editor` agent. Each case seeds a synthetic
ledger, runs one real editor turn (write tools — `draft_transaction`, `clarify`,
`add_card` — captured, not applied), then grades drafts + behavior.

```sh
pnpm eval          # = promptfoo eval -c evals/promptfooconfig.yaml --no-cache -j 1
pnpm eval:view     # open the results UI
```

Endpoint: `POST /api/test/bench` (agent defaults to the ledger editor). Turn
JSON: `{ text, trace, drafts, clarifies, sqls, draftsValid, draftIssues,
aliases, error }`.

**Adding a case** — append to `evals/promptfooconfig.yaml`: `vars.seed` (a
beancount buffer; synthetic data only, see CLAUDE.md), `vars.message` (the user's
request), `assert` (structural `javascript` over `output.drafts` / `output.sqls`
/ `output.clarifies` / `output.draftsValid` / `output.text`, plus an
`llm-rubric`). Every bug we find should become a case so it stays fixed.

---

## 2. Concierge eval

Behavior eval for the **concierge** (the KG + ledger Q&A agent — `/points` deep
links, inline transfer facts, award hand-offs). Sourced from
`evals/concierge-questions.md`; the committed suite currently covers **§1
(transfer partners & ratios)**.

```sh
npx promptfoo eval -c evals/concierge-bench.yaml --no-cache -j 1
```

Endpoint: `POST /api/test/bench` with `{ agent: 'concierge' }` → runs
`ConciergeDO.__bench_run` (real prompt + full read-tool surface incl. `codemode`
and `reward_accounts`; `ask_user` is captured because it suspends in production).
Turn JSON:

```
{ text,
  trace:  [{ tool, input }],                              // tool calls, in order
  links:  [{ href, kind:'points'|'explore', target, dir, // parsed from text;
             targetExists }],                             // targetExists = slug resolves in KB
  awardOptions, asks, toolsUsed, error }
```

**Three default invariants run on every case** — they encode the regressions we
fixed, so any case re-introducing them fails:

- `no-garble` — gemma tool-call tokens never leak into the text channel.
- `link-is-grounded` — if a `/points` link was emitted, `reward_accounts` must
  have run (the concierge never builds a link from memory).
- `slug-is-real` — every `/points` target resolves to an actual KB node (catches
  invented slugs like `program/britishairways`).

Per-case asserts then check the **answer shape** from `concierge-questions.md`'s
"Expected" column: link cases (§1 items 1/2/6/7) assert the `target` slug + `dir`
(`to` = reaching a currency, `from` = what it transfers out to); inline-fact
cases (3/4/5) assert NO link + the value in the text + a small `trace.length`
(no tool-call wandering); all are backstopped by an `llm-rubric`.

**Adding a case** — append to `evals/concierge-bench.yaml`: `vars.message`,
`vars.seed` (`''` for KG-only routing questions; a synthetic ledger only when the
answer depends on holdings), `assert` over `output.links` / `output.trace` /
`output.text` + an `llm-rubric`. To extend coverage to other categories, work
down `concierge-questions.md` §2–§14.

---

## 3. Statement ingest

Statement drafting runs the editor's statement agent off the per-capture
`ChatDO` (`runDraftStatement`) — same brain as the editor, with the
`draft_transaction` tool RECORDING instead of suspending. Two things to know:

- **Use the right endpoint.** `/api/test/bench` runs the **ledger** editor agent
  (thinking off, no statement shards) — it does NOT exercise the statement path.
  To test real ingest behavior (statement agent + thinking-on + the statement
  prompt + the pad+balance closings), hit **`/api/test/ingest`**, which runs the
  production `runDraftStatement` and returns `{ drafts, draftsValid, clarifies,
  trace, text, error }`.
- **Statement ingest is evaluated ONLY against REAL statements** (text + page
  images, with secrets) — there is NO committed synthetic statement sweep. A
  synthetic statement eval is misleading: fictional issuers aren't in the KG, so
  `card_guide` misses and the model improvises, and a text-only case never
  exercises the multimodal (image) path production runs.
- **Real-statement eval (LOCAL ONLY, never committed):** the owner's real
  statements live in **`~/milesvault-verify/`** (a sibling of the repo, outside
  git — per the CLAUDE.md privacy decree): source PDFs, decrypted `extracts/`
  (text), rendered `images/` (page JPEG data-URLs), `passwords.json`,
  `render-images.mjs` (PDF pages → `images/<label>.json`, matching the website's
  client render), `rebuild.sh` (regenerates BOTH extracts and images), and
  `statements-real.yaml`. The eval sends **text + page images** to
  `/api/test/ingest`, exactly like a real upload — so it exercises the multimodal
  path, not text-only. Run:
  ```sh
  ~/milesvault-verify/rebuild.sh    # (re)decrypt extracts AND re-render page images
  export TEST_USER_TOKEN=$(grep '^TEST_USER_TOKEN=' .dev.vars | cut -d= -f2-)
  npx promptfoo eval -c ~/milesvault-verify/statements-real.yaml --no-cache -j 1
  ```
  Never copy anything from `~/milesvault-verify` into the repo. See its own
  README for layout + how to add a statement.

---

## Flakiness

gemma is non-deterministic and occasionally garbles a tool call. To measure a
pass *rate* rather than a single sample, add `--repeat`:

```sh
pnpm eval -- --repeat 5
npx promptfoo eval -c evals/concierge-bench.yaml --no-cache -j 1 --repeat 5
```

A case's score is the fraction of repeats that pass every assertion. The
structural (`javascript`) asserts barely flake — a link is a link — so they're
the hard gates; treat the `llm-rubric` scores as a softer signal.

## Debugging with the AI Gateway

To see the actual request/response (incl. the reasoning trace when thinking is
on), read the AI Gateway logs for the `milesvault-staging` gateway:
```sh
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai-gateway/gateways/milesvault-staging/logs?per_page=10&order_by=created_at&order_by_direction=desc" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
# then .../logs/{id}/request and .../logs/{id}/response for bodies
```
A request's `chat_template_kwargs.enable_thinking` confirms whether thinking was
actually on for that step. (Use `CLOUDFLARE_API_TOKEN` from the shell env — not
`CF_AIG_TOKEN`, which only authorizes the inference proxy.)

## Server endpoints (test-gated)

- `POST /api/test/bench` — `{ agent?: 'editor'|'concierge', seed?, message }` →
  reset+seed the test ledger, run one turn of that agent.
  - editor (default) → `{ text, trace, drafts, clarifies, sqls, draftsValid,
    draftIssues, aliases, error }`.
  - concierge → `{ text, trace, links, awardOptions, asks, toolsUsed, error }`.
- `POST /api/test/ingest` — `{ seed?, text, filename?, images? }` → reset+seed,
  stash the statement blob, run the real `runDraftStatement` on its per-capture
  DO, return `{ drafts, draftsValid, clarifies, trace, text, error }`. This is the
  statement-ingest path (thinking on); `/api/test/bench` is not.
- `POST /api/test/judge` — `{ prompt }` → run the judge model, return `{ output }`.

All require the `TEST_USER_TOKEN` secret (absent in production) and the test
user session. They are scaffolding — remove with the rest of the bench harness.
