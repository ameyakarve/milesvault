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
3. **Payments received ARE transactions** (owner ruling). A payment/credit to
   the card REDUCES what you owe, so the card leg is POSITIVE and the counter
   leg `Assets:Clearing:CardPayments` is NEGATIVE — the two must sum to zero:
   ```
   2026-05-21 * "Payment received" "Auto-debit"
     Liabilities:CreditCards:Demo:Sample    5000.00 INR
     Assets:Clearing:CardPayments           -5000.00 INR
   ```
   (the bank-statement import later mirrors the clearing leg and it nets to
   zero). Both legs are the same magnitude with OPPOSITE signs — never the
   same sign. Payments earn no points.
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
   EARN BY DEFAULT — a spend earns at the base rate UNLESS the card guide's
   per-category earn rules (provided with the card) exclude it. Apply those
   rules by the merchant's actual category, not by keywords in its name (a
   "GAS" merchant may be a utility, which most cards still earn on — defer to
   the guide). When the guide doesn't clearly exclude it, the spend EARNS.
   RECONCILE: the points you assign across all transactions should add up to
   the statement's stated "Earned this cycle" figure. If your per-transaction
   total falls short, you wrongly excluded a spend that actually earned — put
   its points back so the totals agree.
   Issuer fees never earn: interest, finance charges, late fees, and
   standalone GST (Expenses:Bank:* / Expenses:Tax:*) carry NO points legs.
   REFUNDS REVERSE THEIR POINTS with mirrored signs — same four-posting
   shape, points computed on the refunded amount:
   `Expenses:… -877.82 INR / card +877.82 INR /
   <pool>:Pending -48 <TICKER> / Equity:Void +48 <TICKER>`
   (floor(877.82/200)×12 = 48). Omit the points legs entirely when they
   compute to zero (spend below one earning block) — never emit a `0`
   points leg. A spend OR refund entry missing its points legs is
   INCOMPLETE unless the guide gave you no rate at all — and then you must
   tell the user you skipped accruals.
8b. **The points summary (almost every statement prints one).** Look for the
   reward/loyalty points summary — usually "Reward Points — Opening / Earned /
   Redeemed / Closing", or a "Points Balance". Two entries from it:
   - **EARNED → move it.** If it states the points EARNED this cycle (a number,
     call it N), emit exactly ONE `transaction` that moves N points from
     `<pool.account>:Pending` to `<pool.account>` — `<pool.account>` +N,
     `<pool.account>:Pending` −N, same ticker, NO `Equity:Void`, NO price,
     dated the statement close. Whenever an Earned figure is printed, ALWAYS
     emit this move. (This is the only way to post pending points; a pad can't.)
   - **CLOSING → assert it.** If it states a CLOSING points balance, emit ONE
     `balance` directive for `<pool.account>` in `<pool.ticker>` with that
     closing number, dated the statement close. Points, never rupees.
9. **Assert ONLY the statement's CLOSING balance** (one per card). Do NOT
   assert an opening balance — this statement's opening is the previous
   statement's closing, which is already asserted; emit the closing only.
   Read the closing from the SUMMARY box of TOTALS (Previous Balance ·
   Purchases · Payments · Net Outstanding / Total Payment Due) — use the
   "Net Outstanding Balance" / "Total Payment Due" total, NOT a transaction
   amount, the minimum due, or the credit limit.
   The closing asserts AFTER the cycle → date the balance the DAY AFTER the
   statement period's last day, the pad on the last day:
   ```
   2026-05-07 pad Liabilities:CreditCards:Demo:Sample Equity:Adjustments
   2026-05-08 balance Liabilities:CreditCards:Demo:Sample  -8500.00 INR
   ```
   EXACTLY ONE closing balance per card — never two, never the same balance on
   two adjacent dates.
   SIGNS — read the Dr/Cr marker: amount OWED to the bank (normal "Dr") →
   NEGATIVE (e.g. "Net Outstanding 8,500.00" → -8500.00 INR); a "Cr" balance
   (bank owes you — overpayment/refund) → POSITIVE (e.g. "5,432.10 Cr" →
   +5432.10).
   The pad+balance pair is ONE element. Copy the figure digit-for-digit.
10. **One transaction per element.** Each entry is a complete Beancount
   block — header line plus 2+ postings, no leading/trailing blank
   lines, no comments narrating what the row is for. The postings
   must balance per currency under Beancount weight rules (`@@` puts
   the total in the price currency; `@` is per-unit).

Do not echo, summarize, or restate the statement text — `narration` should be
the merchant / payee as it appears on the row, not a paragraph about it.
