# Statement extraction

You have the text and page images of a credit-card statement. Turn it into
entries that follow the **ledger rules above** — transaction shapes (a purchase
is four postings), the points lifecycle, forex folding, categories, cashback,
and balance mechanics are all defined there. This section covers ONLY what is
specific to READING a statement.

1. **Identify the account.** Scan the header for issuer + last-4 / account suffix
   and match it to the user's open accounts. Include the last-4 as the optional
   `:<Id>` segment when the statement shows it. If you genuinely cannot pin the
   card, return an empty result — the caller surfaces that to the user.

2. **Infer dates.** Statements show `dd Mon` (no year) within a billing period
   printed elsewhere. Resolve the year from the period or statement date, then
   emit each posting date as `YYYY-MM-DD`.

3. **Filter statement noise; record real charges.**
   - SKIP (not transactions): statement-balance / minimum-due / credit-limit
     summary rows; the reward-point accrual / redemption SUMMARY rows (read them
     for the figures in step 5, but don't emit them as transactions).
   - RECORD (with NO points): interest / finance charges / late fees / standalone
     GST the issuer levies (e.g. "FIN CHGS FOR THIS STMT", "IGST") — a plain
     two-posting expense under `Expenses:Financial:*` + the card leg. Don't skip
     them (the closing won't reconcile) and don't duplicate a row — each printed
     line is exactly ONE entry.

4. **Forex rows — read the layout.** A foreign-currency row prints the foreign
   amount inside a `( CCY x.xx )` bracket next to the merchant, and the billed
   amount as the row's main figure on the right — two different numbers (fold
   them per the forex rule above). The "FOREIGN CURRENCY TRANSACTION FEE" / "DCC
   MARKUP" / "GST" rows that belong to it are often printed interleaved and out
   of order (a GST can appear before its own markup) — pair each to its charge by
   the arithmetic, never by which row sits nearest.

5. **Use the statement's printed reward figures.**
   - When the statement prints points PER ROW, use those numbers verbatim — they
     already bake in the card's category multipliers; don't re-derive from the
     base rate.
   - When it prints "Earned this cycle" (N), that is the landing amount (move N
     from `:Pending` to posted) and the figure your per-row accruals must
     reconcile to.
   - When it prints a closing / "balance as on date" points total, assert that
     number (pad + balance, verbatim).

6. **Assert the card's closing balance.** Read it from the SUMMARY box of TOTALS
   (Previous Balance · Purchases · Payments · Net Outstanding / Total Payment Due)
   — use the "Net Outstanding" / "Total Payment Due" total, NOT a transaction
   amount, the minimum due, or the credit limit. Emit it as a pad + balance dated
   the day AFTER the statement period's last day.

7. **Pad + balance — the exact form, and don't skip it.** Every ingest ends with
   these bookends: ONE pad+balance for the card's closing (step 6) and ONE for the
   points closing (step 5). Each is TWO lines — a `pad` naming the account with the
   `Equity:Void` plug, then a `balance` asserting the printed figure verbatim. The
   pad absorbs any drift between the figure and what your transactions left in the
   account, so the balance reconciles the whole import; a missing bookend means a
   misread row passes silently. ONE pad+balance per closing figure — never a
   0-amount opening pad. Sign the card balance per the rules above (amount owed →
   NEGATIVE; a "Cr" balance → POSITIVE); the points balance is the settled-pool
   total. E.g. a period ending 31 May 2026 with ₹54,321 owed and 12,500 points:

   ```
   2026-06-01 pad Liabilities:CreditCards:Skybank:Plus:1234 Equity:Void
   2026-06-01 balance Liabilities:CreditCards:Skybank:Plus:1234  -54321.00 INR

   2026-06-01 pad Assets:Rewards:Points:Skybank Equity:Void
   2026-06-01 balance Assets:Rewards:Points:Skybank  12500 SKYBANKPTS
   ```

Prefer the extracted TEXT for anything legible in it (dates, amounts, merchant
names); use the page IMAGES only for what the text is missing or garbles (labels
the bank renders as images, like the reward-points summary box). Do not echo or
restate the statement — the narration is the merchant / payee on the row.
