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

## Server endpoints (test-gated)

- `POST /api/test/bench` — `{ seed?, message }` → reset+seed the test ledger,
  run one turn, return `{ text, trace, drafts, clarifies, sqls, draftsValid,
  draftIssues, aliases, error }`.
- `POST /api/test/judge` — `{ prompt }` → run the judge model, return `{ output }`.

Both require the `TEST_USER_TOKEN` secret (absent in production) and the test
user session. They are scaffolding — remove with the rest of the bench harness.
