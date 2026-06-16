# Editor eval bench

End-to-end behavior eval for the `/editor` agent. Each case seeds a synthetic
ledger, runs **one real editor turn** on the deployed staging worker (real gemma
model, real system prompt, real read tools; the write tools — `draft_transaction`,
`clarify`, `add_card` — are captured, not applied), then grades the result.

Built on [promptfoo](https://promptfoo.dev): structural checks are inline
`javascript` assertions over the turn's JSON; correctness is an `llm-rubric`
judged by a stronger model (llama via Workers AI, served by `/api/test/judge` —
gemma can't grade itself, and this keeps the eval self-contained, no OpenAI key).

## Run

```sh
# TEST_USER_TOKEN must be set (the test-user cookie secret). It's in .dev.vars:
export TEST_USER_TOKEN=$(grep '^TEST_USER_TOKEN=' .dev.vars | cut -d= -f2-)

pnpm eval          # run all cases against staging
pnpm eval:view     # open the results UI
```

Cases run **serially** (`-j 1`) — they share one test ledger, so concurrent
runs would clobber each other's seed. `--no-cache` so each run re-hits the model
(the point is to measure the live, non-deterministic behavior).

## Flakiness

gemma is non-deterministic and occasionally garbles a tool call. To measure a
pass *rate* rather than a single sample, add `repeat`:

```sh
pnpm eval -- --repeat 5
```

A case's score is the fraction of repeats that pass every assertion.

## Adding a case

Append to `evals/promptfooconfig.yaml`:

- `vars.seed` — a beancount buffer (synthetic data only; see CLAUDE.md).
- `vars.message` — the user's request.
- `assert` — `javascript` structural checks over the turn JSON
  (`output.drafts`, `output.sqls`, `output.clarifies`, `output.draftsValid`,
  `output.text`) and an `llm-rubric` describing correct behavior.

Every bug we find should become a case here so it stays fixed.

## Statement ingest

Statement drafting runs the editor's statement agent off the per-capture
`ChatDO` (`runDraftStatement`) — same brain as the editor, with the
`draft_transaction` tool RECORDING instead of suspending. Two things to know:

- **Use the right endpoint.** `/api/test/bench` runs the **ledger** editor agent
  (thinking off, no statement shards) — it does NOT exercise the statement path.
  To test real ingest behavior (statement agent + thinking-on + the statement
  prompt + the pad+balance closings), hit **`/api/test/ingest`**, which runs the
  production `runDraftStatement` and returns `{ drafts, draftsValid, clarifies,
  trace, text, error }`.
- **Synthetic sweep (committed):** `statements-sweep.yaml` — multi-txn statements
  mirroring real issuer layouts with invented data, to stress the agentic draft
  loop and pin per-layout quirks. Run: `pnpm eval -- -c evals/statements-sweep.yaml`.
- **Real-statement eval (LOCAL ONLY, never committed):** the owner's real
  statements live in **`~/milesvault-verify/`** (a sibling of the repo, outside
  git — per the CLAUDE.md privacy decree): source PDFs, decrypted `extracts/`,
  `passwords.json`, `rebuild.sh` (regenerates extracts), and `statements-real.yaml`
  (points at `/api/test/ingest`). Run:
  ```sh
  ~/milesvault-verify/rebuild.sh    # (re)decrypt the extracts
  export TEST_USER_TOKEN=$(grep '^TEST_USER_TOKEN=' .dev.vars | cut -d= -f2-)
  npx promptfoo eval -c ~/milesvault-verify/statements-real.yaml --no-cache -j 1
  ```
  Never copy anything from `~/milesvault-verify` into the repo.

### Debugging with the AI Gateway

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

- `POST /api/test/bench` — `{ seed?, message }` → reset+seed the test ledger,
  run one **ledger-agent** turn, return `{ text, trace, drafts, clarifies, sqls,
  draftsValid, draftIssues, aliases, error }`.
- `POST /api/test/ingest` — `{ seed?, text, filename?, images? }` → reset+seed,
  stash the statement blob, run the real `runDraftStatement` on its per-capture
  DO, return `{ drafts, draftsValid, clarifies, trace, text, error }`. This is the
  statement-ingest path (thinking on); `/api/test/bench` is not.
- `POST /api/test/judge` — `{ prompt }` → run the judge model, return `{ output }`.

All require the `TEST_USER_TOKEN` secret (absent in production) and the test
user session. They are scaffolding — remove with the rest of the bench harness.
