# MilesVault — Product Requirements (Interaction PRD)

Companion to [`product.md`](./product.md). That doc says *what* we are building; this doc says *how users interact with it*.

---

## 0. Core concepts

A small glossary that every flow in this PRD depends on.

- **Ledger** — the canonical plaintext beancount source owned by the user. Single source of truth. Always viewable, always editable by hand.
- **Transaction** — one beancount directive: a header line (`date flag "payee" "narration"`) plus two or more indented posting lines that sum to zero per commodity.
- **Card** — the UI component that wraps a single transaction. Renders identically in every surface (mobile feed, desktop right pane, ledger tab detail view). A card has a lifecycle state.
- **Card states**:
  - **Draft** — AI-proposed or in-progress manual entry. Not yet on the user's ledger. Has `Accept / Edit / Discard`.
  - **Staged** — user has accepted the draft. Lives in a pending bucket. Has `Edit / Unstage`.
  - **Committed** — persisted to the ledger. Has `Edit / Delete` (which themselves go back through staging).
- **Validity strip** — a one-line footer inside every card. Green "Balances: 0.00 USD ✓" when the transaction balances per commodity; red with the parser / balance error otherwise. Accept is disabled while the strip is red.
- **Commit** — the deliberate act of moving all staged cards into the ledger. Git-like. A commit can carry an optional message.
- **Revert** — discard all staged cards. Never touches committed history.
- **Scribe** — the AI surface. Drafts transactions, answers questions, raises insights. Never writes to the ledger without user acceptance.

---

## 1. First-run onboarding

**Goal.** Take a brand-new user from sign-up to one committed transaction in under two minutes, without showing them raw beancount syntax unless they ask for it.

**Entry state.** User has just completed auth. No accounts, no commodities, empty ledger.

**Flow.**
1. Welcome screen: one sentence — "MilesVault keeps your finances in plaintext you own. Let's set up your ledger."
2. **Step 1 — Primary currency.** Curated picker (USD, EUR, INR, GBP, JPY, SGD, AED, CAD, AUD) plus a "type a custom code" affordance. Creates a single global commodity if one doesn't exist, otherwise selects the user's default.
3. **Step 2 — Seed accounts.** A checkbox list of common paths prefilled and selected by default:
   - `Assets:Checking`
   - `Liabilities:CreditCard`
   - `Income:Salary`
   - `Expenses:Food`
   - `Expenses:Rent`
   - `Expenses:Transport`
   - `Equity:Opening-Balances`

   Each row is renameable inline. The user can uncheck any or all.
4. **Step 3 — Optional specificity.** "Got a specific bank or card? We'll nest those accounts for you." One text field; on submit, adds e.g. `Assets:Checking:Chase` and `Liabilities:CreditCard:Amex`.
5. Land on Home with an empty feed and a single ghost card: *"Tell me your first transaction. Try 'coffee $5 at Blue Bottle on amex'."* Composer is focused.
6. First accepted card auto-commits (silent, with a toast: "Saved to ledger.") to give immediate reinforcement. Subsequent drafts use the normal staging flow.

**Edge cases.**
- User skips seed accounts entirely. AI's first draft prompts them to create the accounts inline (see Flow 2 — missing-entity handling).
- User picks a custom commodity. All subsequent AI prompts default to it.
- User closes onboarding mid-way. State is persisted per step; they resume where they left off.

**Out of scope for v1.**
- Import from existing beancount file.
- Import from CSV, Mint, YNAB, Plaid, etc.
- Sample / demo ledger.

---

## 2. AI-drafted capture (hero flow)

**Goal.** User describes a transaction in natural language; Scribe produces a balanced card; user accepts.

**Entry points.**
- Mobile: composer pinned to the bottom of the Home dashboard.
- Desktop: a prominent capture composer immediately under the header on the Home dashboard, and a smaller composer at the bottom of the right-side conversation pane on the Ledger tab.
- Global: ⌘K opens a modal composer from any screen.

**Flow.**
1. User types "coffee $5.50 at Blue Bottle on amex" and hits send (or speaks into the mic).
2. Scribe streams a reply into the feed. The reply is not prose — it's a card:
   ```
   2026-04-16 * "Blue Bottle" "coffee"
     Liabilities:CreditCard:Amex    -5.50 USD
     Expenses:Food:Coffee            5.50 USD
   ```
   Syntax highlighted. Validity strip "Balances: 0.00 USD ✓" appears the moment the card is parseable.
3. Card renders in Draft state with `Accept / Edit / Discard`.
4. User taps **Accept** → card transitions to Staged. Pending strip appears at the bottom of the viewport: *"1 block pending · Commit · Revert"*.
5. User keeps drafting. More cards stack in the feed; pending counter grows.
6. User taps **Commit**. All staged cards move to Committed state, persist to the ledger, and the pending strip collapses. A toast confirms: *"3 transactions committed."*

**Missing-entity handling.**
- Scribe must use only accounts and commodities the user already has. If the user's request requires one that doesn't exist, Scribe does **not** invent it. Instead, the card renders with an inline placeholder and a call to action:
  > Unknown account: `Expenses:Food:Coffee`. `[Create]`
  Clicking Create opens a one-field modal prefilled with the path; confirming adds the account and the card re-validates.

**Multi-transaction drafts.**
- A single user turn can produce multiple cards (e.g., "log my weekend trip — flight $320, hotel $180, and $45 for cabs"). Each is its own card; each is independently Accept/Discard-able.

**Edge cases.**
- Scribe produces an unbalanced card. Validity strip is red with the shortage ("Imbalance: +0.45 USD"). Accept is disabled. User can Edit to fix, or tell Scribe "it doesn't balance, check my commodities."
- User navigates away with staged or drafted cards. Both states persist server-side. The pending strip reappears on return.
- User rejects a draft. Tapping Discard removes the card and sends an implicit "ignored" signal to Scribe (used later for personalization; not v1).

**What explicitly does not happen.**
- Accept is not Commit. Two separate actions, two separate states.
- No silent account or commodity creation.
- No bank connection, SMS read, email ingestion, screen reading, or calendar scan. Ever. Scribe's only input is the conversation in-app.

---

## 3. Manual capture

**Goal.** Power user types beancount directly without invoking Scribe.

**Entry points.**
- Mobile: Ledger tab → floating `+` → empty Draft card opens in edit mode.
- Desktop: click anywhere in the left-pane ledger source at the bottom and start typing, or press ⌘N to open a new Draft card at cursor.

**Flow.**
1. Empty card opens with a placeholder skeleton:
   ```
   2026-04-16 * "payee" "narration"
     Account:Path    AMOUNT COMMODITY
     Account:Path    AMOUNT COMMODITY
   ```
   Date defaults to today; payee/narration strings are ghost text the user types over.
2. User types. Autocomplete fires on:
   - Account position (triggered by capital letter) → fuzzy match on existing account paths.
   - Commodity code (triggered after a number + space) → fuzzy match on existing commodities.
3. Validity strip updates live on every keystroke.
4. Once balanced and all entities exist, `Accept` enables. Accept → Staged. Same Commit flow as Flow 2.

**Edge cases.**
- User types an account path that doesn't exist. Inline tooltip offers "Create account `Expenses:Foo:Bar`" on return.
- User types syntactically invalid beancount. Validity strip shows the parser message with column offset.
- User abandons the card mid-edit. In-progress text autosaves as a Draft; reopens on next visit.

---

## 4. Editing a transaction

**Goal.** Change any transaction regardless of state.

**Entry points per state.**
- Draft card → tap/click the card body (mobile) or any line in the card (desktop) to enter edit mode.
- Staged card → same as Draft; edits stay within the Staged state.
- Committed card → edit kicks the card back into a "modified" staged state; the original stays in the ledger until commit.

**Edit surfaces.**
- **Inline card edit** (mobile primary, desktop right pane): monospace textarea replaces the card body. Same syntax highlighting. Validity strip live.
- **Ledger source edit** (desktop primary via left pane, mobile via Ledger tab): user edits raw beancount text. Each transaction block is independently stageable; edits detect which blocks changed and stage only those.

**Controls.**
- `Save draft` on a Draft card.
- `Save edit` on a Staged or Committed card. A staged/committed-edit card carries a subtle "edited" chip until committed.
- `Revert this card` — discards the pending edit, restores the original. Only on committed-edits.

**Deletion.**
- Swipe left (mobile) / Delete key with card focused (desktop) → card enters a "staged deletion" state. Visible in the Pending strip as "2 edits · 1 deletion pending". Commit finalizes.
- Deletions respect committed-edit rules: a committed txn's deletion only applies on Commit; Revert restores.

**Edge cases.**
- User edits the ledger source to introduce a syntax error. The block is flagged red, other blocks still commit-able individually, and a banner explains which line failed.
- Two edits to the same committed txn within the same staging window — last write wins; earlier versions are recoverable until commit.

---

## 5. Search / browse

**Goal.** Find past transactions quickly.

**Entry points.**
- Mobile: Ledger tab, sticky search bar at top.
- Desktop: ⌘F anywhere over the left pane; also the Ledger top bar.

**Search grammar (single smart input, no chips).**
- Plain text → substring match against payee and narration.
- `@account` → substring match on account path, e.g. `@Food:Coffee` or `@Chase`.
- `#tag` → exact match on beancount tag.
- `^link` → exact match on beancount link.
- Dates:
  - `2026-03` → entire March 2026.
  - `>2026-03-01` / `<2026-04-01` → open-ended.
  - `2026-03-01..2026-04-01` → range.
- Combine with spaces → implicit AND. `@groceries >2026-03-01 #costco`.

**Results view.**
- Same card component as everywhere else. Scrollable. Newest first by default, with a toggle.
- Result header: count and totals per commodity. *"18 transactions · Total $1,234.56 USD · 12,500 MILES."*

**Edge cases.**
- Zero results → empty state with examples of the grammar.
- Very large result set → windowed scroll with a jump-to-date affordance.
- Malformed query (`@` with nothing after) → ignored gracefully; search runs on the rest.

---

## 6. Q&A with the ledger

**Goal.** User asks a natural question; Scribe answers with numbers, cites the underlying transactions, and never fabricates.

**Entry points.**
- Mobile: the same composer as AI-drafted capture (Home dashboard).
- Desktop: same Home dashboard composer; on the Ledger tab, the right-pane conversation composer also accepts questions.

**Flow.**
1. User asks: *"how much did I spend on travel in Q1?"*
2. Scribe runs a structured query against the ledger (beancount query or equivalent SQL against our derived tables).
3. Scribe replies with a compact answer:
   ```
   Travel, Q1 2026: $2,418.30 across 12 transactions.
     Flights    $1,620.00  (4)
     Hotels       $540.30  (3)
     Transit      $258.00  (5)
   ```
4. Every number is a citation. Tapping/clicking opens a filtered ledger view showing the exact transactions that rolled up into it.

**Question shapes supported in v1.**
- **Totals** over a period and/or account: "what did I spend on X?"
- **Balances** right now: "what's my checking balance?"
- **Trends**: "how has my grocery spend changed in the last 3 months?"
- **Account activity**: "show me every Amex charge in March."
- **Simple forecasts** from history: "am I on track for rent this month?"

**Proactive insights.**
- Same mechanism runs in the background on a schedule (nightly for active users).
- Findings surface as dismissible cards on Home with a small lightbulb icon:
  - *"Groceries are up 18% vs last quarter."*
  - *"New recurring charge detected: Notion, $10/mo since Feb 14."*
  - *"Based on history, you're $400 short for April rent."*
- Each insight card links to the underlying query. Dismissing removes it; the user never gets the same insight twice without re-triggering.

**Guardrails.**
- Scribe cites or declines. If the ledger doesn't contain the answer, Scribe says so explicitly: *"I don't see any travel transactions in Q1. Want to add some?"*
- Numbers in Scribe's reply must come from a deterministic query, not from the model's head.

**Edge cases.**
- Ambiguous question ("how much rent") → Scribe asks one clarifying question ("over what period?") rather than guessing.
- Multi-commodity totals → Scribe shows per-commodity lines; if the user asked for a single figure, Scribe converts at the latest known price and calls that out.
- Very large result sets → Scribe paginates or summarizes and offers "show all."

---

## 7. Reports

**Goal.** Deterministic, read-only views over the ledger for the moments when a user wants structure rather than conversation.

**Entry points.**
- Desktop: top-level "Reports" tab.
- Mobile: surfaced via a "More" menu on the Ledger tab — deliberately less prominent because reports are read-heavy and long.

**Report types (v1).**
1. **Balance Sheet** — Assets, Liabilities, Equity as of a date. Drill-down by account tree.
2. **Income Statement (P&L)** — Income and Expenses over a period. Drill-down by account tree, group-by month toggle.
3. **Cash Flow** — Inflows and outflows over a period, by account group.
4. **Net Worth Over Time** — Line chart, monthly granularity, per-commodity and converted-to-primary toggle.
5. **Account Activity** — Chronological list of every posting for a selected account.

**UI.**
- Left rail: report picker.
- Top bar: period selector (Last month, Last quarter, YTD, Custom range) and commodity selector.
- Main area: the report.
- Every figure in a report is a citation back to the ledger (same as Q&A answers).

**Export.**
- Per-report: `Copy as markdown`, `Download CSV`, `Download PDF`.
- CSV uses ISO dates, full account paths, numeric amounts with commodity codes.

**Edge cases.**
- Sparse history → empty state with *"You need at least 30 days of data for this view."*
- Multi-currency without prices → figures render in native commodity with a banner: *"Add a price for USD/EUR to see converted totals."*

---

## 8. Commit / Revert (the staging model)

**Goal.** Make every change to the ledger deliberate and auditable.

**States (restated).**
- **Draft** — scratch work, per-card, not visible to reports or search.
- **Staged** — user accepted or edited a card; held in a pending bucket; server-persisted across sessions.
- **Committed** — written to the ledger. Visible everywhere.

**Persistence.**
- Drafts and Staged are stored per user in their own tables. Never enter the canonical `txns` collection until commit.
- Committing writes to `txns` and updates the derived ledger source file.
- Every commit is recorded with a timestamp, optional message, and a list of affected txn ids.

**Controls.**
- `Accept` (draft → staged).
- `Unstage` (staged → draft).
- `Commit` — persists all staged changes (adds, edits, deletions) as one atomic ledger commit. Optional message field revealed with a long-press / right-click on the Commit button.
- `Revert` — discards all staged changes. Confirmation modal: *"Discard 3 staged changes? This cannot be undone."*
- `Revert this commit` — available from Ledger History (see below). Creates a new commit that undoes the selected one.

**Pending strip.**
- Persistent, slim bar pinned to the bottom of every screen that can stage work (Home, Ledger, Edit).
- Shows a summary: *"3 blocks pending · Commit · Revert"*. Breakdown expands on tap: "2 new · 1 edit · 0 deletions."
- Dismissible but re-appears on new staging activity.

**Ledger History (v1 read-only).**
- List of prior commits with timestamp, optional message, change count.
- Clicking a commit shows the diff (added / edited / removed txns).
- `Revert this commit` is a later-version feature.

**Edge cases.**
- Commit with zero staged items → button is disabled.
- Very large commit → confirmation: *"Commit 50 changes? This will rewrite a large portion of your ledger."*
- Concurrent sessions (two tabs): staging writes are per-session within the same user account; the last commit wins, and the other session sees its staged items remain pending against the new ledger state, with a banner offering to rebase.

---

## 9. Cross-cutting principles

These apply to every flow above.

- **Ledger is truth.** No action writes to the ledger without an explicit Commit.
- **Same card everywhere.** The card component is the atomic unit of interaction. Feed, search results, edit view, reports citations — all render the same card.
- **Privacy posture.** No device ingestion: no SMS, no email / mail scraping, no calendar, no screenshots, no bank feeds, no Plaid, no OCR of statements, no notification reading, no contacts. The assistant's only inputs are what the user types or speaks inside the app. The UI must never depict, advertise, hint at, or visually attribute a transaction to any of these sources — no "Source: SMS", "Source: Mail Scraper", "Found in your inbox", "Imported from bank", or similar tags, ever, even as illustrative copy.
- **AI honesty.** Scribe cites or declines. Numbers come from queries; prose never invents figures.
- **Offline-tolerant.** Drafting, editing, and searching work against the last-synced ledger. Commits require network; staged work waits otherwise.
- **Keyboard-first on desktop.** Every action has a shortcut: ⌘K composer, ⌘N new card, ⌘Enter accept, ⌘⇧Enter commit, `/` focus search.

---

## 10. Out of scope for v1 (captured to avoid scope creep)

- Bank / card feed integration (Plaid, Yodlee, native bank APIs).
- Statement OCR import.
- Existing-ledger import (beancount file upload, Ledger CLI migration).
- Demo / sample data mode.
- Multi-user / household ledgers.
- Mobile native apps (iOS/Android). PWA only in v1.
- Rules / auto-categorization engines.
- Tax reports.
- Revert-this-commit action (history is read-only in v1).
- Voice reply from Scribe (voice-in is fine; Scribe replies in text + cards).
