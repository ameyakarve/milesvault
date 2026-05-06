# MilesVault — Product Requirements Document

## 1. Vision

MilesVault is a ledger-accurate, reward-aware personal finance tool for Indian credit-card enthusiasts. Where other Indian PFM apps categorize spend and other reward tools catalog card metadata, MilesVault uniquely holds both the transaction ledger *and* the reward accrual in a single beancount-native data model. Every feature in this PRD flows from one insight: **because every txn carries actual accrued points and actual merchant context, MilesVault can answer optimization and valuation questions no other tool can.**

## 2. Target User

A 25–45 year old Indian CC enthusiast who:

- Holds 5–12 cards (e.g., HDFC Infinia, Axis Magnus, SBI Cashback, Amex Plat Reserve, Amazon Pay ICICI)
- Reads Technofino / Live From A Lounge / Reddit r/CreditCardsIndia
- Optimizes for points-per-rupee, milestone achievement, and redemption CPP
- Currently tracks spend + rewards in Excel / Notion / personal beancount
- Is comfortable with structured data but wants faster, queryable answers

Secondary user: the casual-but-curious user who wants a clean CC + spend view without reward optimization.

## 3. Current State (April 2026)

Shipped in `(frontend)/chat/`:

- Beancount parser round-trip (text ↔ structured form)
- Hybrid chat + form UI for new and existing transactions
- Per-posting typed cards: EXPENSE, CC SPEND, REWARD, REDEMPTION, DISCOUNT, CASHBACK, POINTS TRANSFER
- Transfer family cards: TRANSFER, CC PAYMENT, WALLET TOP-UP, GIFT CARD
- Pill overlays: REFUND (neg expense), CC REFUND (pos liability), FEE (`Expenses:Fees:*`)
- Forex CC spend with auto FX lookup and `@@` price clause
- Paired-posting validators (cashback asset/income, reward asset/income, pt transfer magnitude)
- Storybook + Playwright visual regression harness

What's missing is *everything that makes the ledger actionable*. The rest of this PRD is that list.

## 4. Themes & Prioritized Features

Features are grouped by theme and prioritized P0 (next release), P1 (6-month horizon), P2 (longer).

---

### Theme A: Make the Ledger Actionable

The ledger is accurate but inert. Users want answers, not rows.

#### A1. Milestone & fee-waiver tracker — **P0**

> *"HDFC Infinia YTD spend: ₹8.3L of ₹10L fee-waiver. 73 days to anniversary. ₹2,329/day needed."*

Per-card metadata: statement day, due day, anniversary month, milestone rules (annual, quarterly, welcome bonus with join-date window). Daily recompute from ledger. Most-requested feature on Technofino; SBI's own app just added this in 2024. Small: pure ledger query + config.

#### A2. Realized effective return rate — **P0**

> *"HDFC Infinia this quarter: 6.8% realized. SmartBuy category: 14.2%. Rest: 3.3%. If grocery ₹18k had gone to Magnus: +₹720."*

Compute actual return from paired `Liabilities:CreditCards:*` / `Assets:Rewards:*` postings divided by spend. Per card, per category, per month. No tool can do this because no other tool has both data in the same row. Small.

#### A3. Natural-language ledger assistant — **P1**

Extend the existing chat UI into an analytics surface. Queries like "which card gave me the worst return last month?" or "am I on track for Magnus ₹1.5L this month?" resolved against the structured ledger. Key differentiator vs. generic finance chatbots: answers come from the user's own verified ledger with known accounts, not screen-scraped bank feeds with categorization noise. Large, but scaffolding already exists.

---

### Theme B: Reward Optimization

#### B1. Card-for-merchant recommender (retrospective + prospective) — **P0**

> *"You spent ₹47k at Zepto last quarter. Magnus would have earned 4x vs. the 2x you got on Regalia."*

Requires a maintained MCC→card→multiplier table (community-sourced from Monzy/Technofino data). Retrospective mode audits past spend; prospective mode suggests a card before you swipe (eventually via shortcut or widget). CardPointers-style answer but grounded in actual historical spend. Medium. The hard part is keeping multiplier data current — build an in-repo YAML with versioning.

#### B2. Points portfolio valuation (tiered) — **P0**

> *"SmartBuy: 12,400 pts → Floor ₹3,720 | Optimized ₹6,200 | Stretch ₹14,880 via AI Maharaja."*

Commodity price clauses already work in beancount. Add a redemption-path table: `{currency, path, CPP}`. Show floor / optimized / stretch values. Small.

#### B3. Devaluation audit trail — **P1**

> *"Your Jan 2026 SmartBuy pts were valued at the old 5x rate. Rate is now 3x. Recomputed value: −₹2,340 across 18 txns."*

Maintain a rules-changelog. When a rule versions, re-audit affected accruals and show a diff. Uniquely expressible as commodity price updates in beancount. Medium (alert is small, rules database is the work).

#### B4. Transfer-partner sweet-spot calculator — **P2**

> *"50k HDFC pts → Air India (2:1) 25k miles → BOM-LHR J est. ₹28k at 67k price. SmartBuy face value: ₹50k. SmartBuy wins unless you find <55k mile inventory."*

Requires award-chart data + transfer ratio versioning. Large but high-delight.

---

### Theme C: India-Specific Surfaces

#### C1. Gift voucher portal & cap tracker — **P0** (user emphasized)

> *"SmartBuy vouchers: ₹12k of ₹15k monthly cap remaining. Amex ShopWise: ask. Effective return buying now: 16.7%."*

Per-portal monthly reset counters on gift-card transactions. SmartBuy / Gyftr / ShopWise / Grab Deals. Voucher-run planner as a single widget. Small — metadata on existing gift-card accounts. This is the direct extension the user flagged for building out gift-card tracking.

#### C2. LRS / TCS aggregation — **P1**

> *"LRS used this FY: ₹6.2L of ₹7L threshold. TCS triggers above ₹7L at 20%. 4 forex txns across HDFC and Axis."*

Aggregate forex CC spend across all cards by FY. Track TCS withholdings as `Assets:TaxCredits:TCS` (recoverable at ITR). Small query; financial consequences are real.

#### C3. DCC detector — **P1**

Flag txns where merchant country ≠ India but currency = INR (dynamic currency conversion). Users lose 3–7% invisibly. Small with a merchant-country lookup; medium without one.

#### C4. Lounge visit tracker — **P2**

Zero-cost txn entries consumed against per-card quota (Infinia Priority Pass 6/qtr, Magnus 8/qtr international, etc.). Shows benefit value extracted YTD. Small — metadata only.

---

### Theme D: Data Ingestion (The Real Adoption Blocker)

Today every txn is hand-typed. This caps users at the handful willing to do that.

#### D1. SMS transaction parser — **P0**

Use the existing open-source `transaction-sms-parser` (by saurabhgupta050890) to pre-fill the form from a pasted SMS. HDFC/Axis/SBI/ICICI all send structured SMSes. The chat+form hybrid already exists — SMS just becomes another input mode. Small.

#### D2. PDF statement import — **P1**

Per-issuer PDF parser (start with HDFC Infinia, then Axis, SBI). Output: draft beancount with guessed accounts + tentative accruals. User reviews and commits. Medium per issuer; reuses existing form for review.

#### D3. Email alert parser — **P2**

Transaction notification emails as a third input. IMAP or forwarded-email. Medium.

---

### Theme E: Health & Hygiene

#### E1. Payment & statement reminders — **P0**

> *"4 cards due in 7 days. Total ₹1.24L. Infinia utilization 68% — consider pay-before-statement in 3 days."*

Per-card billing-cycle metadata + utilization calc from liability balance. Small.

#### E2. Points expiry timeline — **P1**

Per-lot expiry tracking using beancount's natural lot model. Rules: `+3y from earn` (Maharaja Club), `rolling 12 months inactivity` (InterMiles). Surfaces a unified "expiring soon" view across programs. Medium — expiry rules need per-program config.

#### E3. Household / add-on card model — **P2**

Sub-accounts under primary CC (`Liabilities:CreditCards:HDFC:Infinia:AddOn:Spouse`). Rolls up to primary for milestones, breaks out for family reimbursement views. Small.

---

## 5. Prioritization Summary

**P0 — next release** (small, high-signal, all ledger-query features):

1. Milestone & fee-waiver tracker (A1)
2. Realized effective return rate (A2)
3. Points portfolio valuation (B2)
4. Card-for-merchant recommender — retrospective mode first (B1)
5. Gift voucher portal & cap tracker (C1)
6. SMS transaction parser (D1)
7. Payment & statement reminders (E1)

**P1 — 6-month horizon**:

1. NL ledger assistant (A3)
2. Devaluation audit trail (B3)
3. LRS / TCS aggregation (C2)
4. DCC detector (C3)
5. PDF statement import (D2)
6. Points expiry timeline (E2)

**P2 — longer**:

1. Transfer-partner sweet-spot calculator (B4)
2. Lounge visit tracker (C4)
3. Email alert parser (D3)
4. Household / add-on model (E3)

## 6. Why MilesVault Wins

Compared to:

- **Bank apps**: single-issuer only; no optimization view
- **CardPointers / MaxRewards**: US-centric; no ledger; no realized return
- **Paisa (upstream)**: beancount-accurate but no CC / reward semantics
- **CRED**: payment reminders only; no reward granularity
- **Notion / Excel**: no automation, no queries
- **Technofino spreadsheets**: the most dedicated users are literally begging for what MilesVault can ship

The unique wedge is **ledger × rewards in one model**. Every P0 feature exploits this; no competitor can match it without rebuilding from scratch.

## 7. Non-Goals

- Screen-scraping bank portals (brittle, ToS-hostile)
- Credit score simulation / CIBIL integration (out of scope, separate domain)
- Investment tracking beyond what beancount already provides
- Becoming a full replacement for ITR filing software
