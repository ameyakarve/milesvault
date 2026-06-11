# Statement extraction

When you have read the raw text of a card / bank statement (via
`read_statement`), turn it into a `draft_transaction` call: each element of the
`transactions` array is one complete Beancount transaction ready to review.
Follow these rules when building that array.

1. **Identify the account.** Scan the statement header for issuer +
   last-4 digits / account suffix and match against the open-accounts
   list in the ledger context. If the user has
   `Liabilities:CreditCards:HSBC:Cashback:1234` and the statement says
   `Card ending 1234`, that's your account. Include the last-4 as the
   optional `:<Id>` segment when the statement shows it. If you genuinely
   cannot pin the account, return an empty `transactions` array — the
   caller will surface that to the user.
2. **Infer dates.** Statements usually show `dd Mon` (no year) within
   a billing period printed elsewhere. Use the period or statement
   date to resolve the year, then emit each posting as `YYYY-MM-DD`.
3. **Payments received ARE transactions** (owner ruling): record each
   payment/auto-debit credit to the card with the counter-leg
   `Assets:Clearing:CardPayments` (negative — money left the bank toward
   the card; the bank-statement import later mirrors it and the clearing
   account nets to zero). Payments earn no points.
4. **Filter noise vs. record fees.**
   - SKIP (not transactions): statement balance / minimum due / credit
     limit summary rows; reward-point accrual / redemption summary rows
     (but if the summary states the points EARNED this cycle, REMEMBER
     that number — it drives the landing entry below).
   - RECORD, but with NO reward points: interest / finance charges / late
     fees / standalone GST that the ISSUER levies (e.g. "FIN CHGS FOR THIS
     STMT", "IGST"). These are real charges that hit the card balance, so
     record each as a plain two-posting expense (`Expenses:Bank:FinanceCharges`,
     `Expenses:Bank:Fees`, `Expenses:Tax:GST`) + the card leg — never with
     points legs. Do NOT skip them (the closing balance won't reconcile)
     and do NOT duplicate a row: each printed line is exactly ONE entry.

   A **forex-markup fee** and its **GST** that follow a foreign-currency
   charge are NOT noise and are NOT standalone transactions — fold them
   into the charge they belong to (next point). Never emit a bare
   `"GST"` or `"FOREIGN CURRENCY TRANSACTION FEE"` entry of its own.
4. **Categorize from the open-accounts list.** Pick the best-fitting
   expense account (e.g. a grocery name → `Expenses:Food:Groceries`).
   Don't invent receivables, equity plugs, or accounts that aren't
   in the list unless no `Expenses:*` fits.
5. **Currency follows the card.** If the open account is tagged
   `[INR]`, each posting is INR — don't infer FX from a merchant name
   unless the statement explicitly shows a foreign currency amount
   alongside the INR billed amount (in which case those become
   separate forex-markup legs per the existing rules).
6. **Fold forex fee + GST into the charge.** When a row shows a foreign
   amount (e.g. `( USD 9.28 )`), the "FOREIGN CURRENCY TRANSACTION FEE" /
   "DCC MARKUP" and "GST" rows that follow it belong to it — emit ONE
   transaction: the foreign amount with `@@` set to the **billed INR
   exactly as printed** (do not re-derive it), plus the markup and GST as
   INR legs, with the card debited for the sum. Pair stray fee/GST rows
   to their charge by the arithmetic (markup ≈ 2% of billed INR, GST ≈
   18% of markup). See the worked forex example.
7. **Credits are refunds.** A `Cr` row that isn't a bill payment reverses
   a purchase: negative expense leg, positive card leg. Keep each `Cr`
   row as its own transaction — never net two together or fold a refund
   into a receivable.
8. **Every eligible spend carries its points legs.** For a credit-card
   statement, each spend entry follows the card guide's earn example:
   expense leg + card leg + `pool.account`:Pending points leg +
   `Equity:Void` contra, points = `floor(amount / per) * points` from the
   guide's base rate, commodity = `pool.ticker`. No tag — tags are for
   LINKING related entries only (e.g. refund ↔ original), never decoration.
   Excluded categories per the guide (fuel, rent, wallet loads,
   government/tax) get the plain two-posting form — no points legs. Issuer
   fees never earn: interest, finance charges, late fees, and standalone
   GST (Expenses:Bank:* / Expenses:Tax:*) carry NO points legs, ever.
   REFUNDS REVERSE THEIR POINTS with mirrored signs — same four-posting
   shape, points computed on the refunded amount:
   `Expenses:… -877.82 INR / card +877.82 INR /
   <pool>:Pending -48 <TICKER> / Equity:Void +48 <TICKER>`
   (floor(877.82/200)×12 = 48). Omit the points legs entirely when they
   compute to zero (spend below one earning block) — never emit a `0`
   points leg. A spend OR refund entry missing its points legs is
   INCOMPLETE unless the guide gave you no rate at all — and then you must
   tell the user you skipped accruals.
8b. **Reward-points balance + landing (when the statement states them).**
   - If the statement prints a CLOSING reward/loyalty points balance
     (often a small "Reward Points — Opening / Earned / Redeemed / Closing"
     summary, or a single "Points Balance"), emit ONE `balance` directive
     for the programme account (`<pool.account>`) in the programme ticker
     (`<pool.ticker>`) with the CLOSING number, dated the statement close.
     This is points, never rupees.
   - If the statement states the points EARNED this cycle, the bank has
     credited them — emit a `transaction` moving that stated number from
     `<pool.account>:Pending` to `<pool.account>` (Pending down, parent up,
     same ticker, NO `Equity:Void`, NO price), dated the statement close.
     This is the only way to move points pending→posted; a pad/balance
     cannot (it plugs to one contra account).
9. **Assert the statement's opening and closing balances.** When the
   statement states them (it almost always does), emit pad+balance pairs
   as single elements, around the transactions:
   - Opening, BEFORE the cycle's transactions (the pad absorbs any drift
     into Equity:Opening-Balances; balance asserts at the START of its
     date, so date it the cycle's first day):
     ```
     2026-04-17 pad Liabilities:CreditCards:Axis:MagnusBurgundy Equity:Opening-Balances
     2026-04-18 balance Liabilities:CreditCards:Axis:MagnusBurgundy  -45000.00 INR
     ```
   - Closing, AFTER all transactions, dated the DAY AFTER the statement
     end (assertions check the start of day):
     ```
     2026-05-18 pad Liabilities:CreditCards:Axis:MagnusBurgundy Equity:Opening-Balances
     2026-05-19 balance Liabilities:CreditCards:Axis:MagnusBurgundy  -62000.00 INR
     ```
   SIGNS — read the statement's Dr/Cr marker carefully:
   - amount OWED to the bank (normal "total due", or "Dr") → NEGATIVE:
     "Total Payment Due 62,000" asserts -62000.00 INR.
   - "Cr" suffix = CREDIT balance, the bank owes the user (overpayment /
     refunds) → POSITIVE: "Total Payment Due 16,754.09 Cr" asserts
     +16754.09 INR. Both opening and closing can be Cr.
   The pad+balance pair must be ONE element (the pad folds into the
   assertion). Copy the statement's stated figures digit-for-digit; never
   compute them.
10. **One transaction per element.** Each entry is a complete Beancount
   block — header line plus 2+ postings, no leading/trailing blank
   lines, no comments narrating what the row is for. The postings
   must balance per currency under Beancount weight rules (`@@` puts
   the total in the price currency; `@` is per-unit).

Do not echo, summarize, or restate the statement text — `narration` should be
the merchant / payee as it appears on the row, not a paragraph about it.
