# MilesVault — Product Definition

## What MilesVault is
- A personal finance app where the source of truth is a plaintext beancount ledger.
- The ledger is always viewable, always editable by hand.
- AI is a co-pilot on top of the ledger — it never replaces it.

## What users do with it
- **Capture**: talk or type to the AI scribe → it drafts transactions as beancount cards → user accepts, edits, or discards.
- **Edit**: open the raw ledger and edit any transaction directly, with syntax highlighting and validation.
- **Browse**: scroll the full ledger, search with a single smart bar (`@account`, `#tag`, plain text, dates).
- **Report**: built-in balance sheet, P&L, cash flow, net worth over time, account activity — deterministic views over the ledger.
- **Ask**: chat questions like "what did I spend on travel in Q1?" — AI reads the ledger and cites specific transactions.
- **Get nudged**: AI insights as dismissible cards — "groceries +18% vs last quarter", "new subscription detected", "rent under-funded by $400".
- **Commit**: saving drafts to the ledger is deliberate, git-like — Commit / Revert affordance.

## What users don't do
- No connecting bank accounts, no SMS scraping, no email parsing, no calendar snooping, no screen reading. Zero device ingestion.

## User-facing entities (only three)
- **Commodities** — currencies, tickers, miles, points.
- **Accounts** — a hierarchical path like `Expenses:Food:Coffee`.
- **Transactions** — beancount text + structured postings, kept in sync.

## Shape of the interface
- **Home tab — dashboard, both mobile and desktop**: spend + rewards stats, insight cards, today's activity, and a prominent capture composer. Mobile stacks these vertically; desktop lays them out across a 12-column grid with a "cards & earnings" right rail.
- **Ledger tab — the source editor**: full beancount source with syntax highlighting and a single smart search bar (no filter chips). On desktop this is the Cursor-style split — source left, an AI conversation pane right for drafting and Q&A in context. On mobile it's a single full-source view with a floating capture button.
- **Reports tab**: deterministic balance sheet, P&L, cash flow, account activity. Desktop-primary; mobile reaches it via a More menu.
- **Cards tab (desktop only in v1)**: list of credit cards with their earn structures, signup bonus progress, and per-card monthly spend / rewards.
- **Component contract**: the beancount card (compact prose row + dark "carved" expanded block + validity strip + Accept/Edit/Discard) renders identically across Home, Ledger, and search results.
- **Naming**: the AI is referred to in copy as "the assistant" or by what it does ("drafts a transaction", "answers from your ledger"). No personified product name.

## Aesthetic
- Warm neutral "editorial paper" page, serif headlines, Inter for UI, JetBrains Mono for all beancount, dark "carved" code blocks only inside cards.

## Positioning
- For people who want their finances in plaintext they can read, back up, and own — with AI that drafts and explains, not decides.
