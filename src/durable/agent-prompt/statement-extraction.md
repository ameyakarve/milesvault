# Statement extraction

You have the text and page images of a credit-card statement. Turn it into
entries that follow the **ledger rules above** — transaction shapes (a purchase
is four postings), the points lifecycle, forex folding, categories, cashback,
and balance mechanics are all defined there. This section covers ONLY what is
specific to READING a statement.

1. **Identify the card, then pick its account.** A statement is for exactly ONE
   card — read the header for issuer + card name + last-4. Then:
   - **If that card is already an OPEN account** (the open-accounts list above),
     use that account path **verbatim** (add the last-4 as the optional `:<Id>`
     segment when shown). Do NOT open a duplicate.
   - **If it is NOT yet held** (a card the user doesn't track yet), OPEN it: post
     to a new `Liabilities:CreditCards:<Issuer>:<Card>` account derived from the
     header (use `card_guide` for the canonical issuer/pool path + ticker). This
     is the normal first-upload-of-a-card case — draft it, don't bail.
   The account must always reflect THE STATEMENT'S OWN card. NEVER substitute a
   DIFFERENT real-world card just because the name resembles one you know — a card
   called "…Apex" is NOT licence to post to some famous airline card, and an
   already-held account for a different card is not a fallback. Only when the
   header is genuinely unreadable (you cannot tell the issuer/card at all) return
   an empty result — the caller surfaces that to the user.

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
     reconcile to. This is the cycle's DELTA, NOT a balance — never assert it.
   - When — and ONLY when — it prints a CLOSING points balance (the pool's
     standing total: "points balance as on <date>" / "total available points"),
     assert THAT number with a pad + balance, verbatim. Whenever that total IS
     printed the bookend is REQUIRED — including when it appears only in the
     rewards summary box or the page image — do not skip it. Do not confuse it
     with "earned this cycle": closing balance = opening + earned − redeemed (the
     running total), a much larger number than the cycle's earnings. If the
     statement prints NO closing points balance, emit no points bookend (never
     fabricate or infer one).

6. **Assert the card's closing balance — when the statement prints one.** Most
   statements carry a SUMMARY box of TOTALS (Previous Balance · Purchases ·
   Payments · Net Outstanding / Total Payment Due) — use the "Net Outstanding" /
   "Total Payment Due" total, NOT a transaction amount, the minimum due, or the
   credit limit. The "Due" / "Outstanding" LABEL does NOT mean the figure is owed:
   when it carries a `Cr` suffix the card is in credit — nothing is due, the issuer
   owes YOU — and the figure is POSITIVE. The printed suffix, not the label, sets
   the sign (step 7). Emit it as a pad + balance dated the day AFTER the statement
   period's last day. If the statement has no totals / amount-due box, emit no
   card bookend — don't reconstruct a figure.

7. **Pad + balance — the exact form.** A closing bookend is TWO lines — a `pad`
   naming the account with the `Equity:Void` plug, then a `balance` asserting the
   figure's DIGITS exactly as printed (never rounded or recomputed) but written in
   beancount form as `<number> <CURRENCY>` — you do NOT transcribe the statement's
   notation: the `₹`/currency symbol, the thousand-separators, and the Cr/Dr mark
   are not part of the amount (the Cr/Dr only sets the sign, per the rule below).
   The pad absorbs any drift between the figure and what
   your transactions left in the account, so the balance reconciles the import; a
   missing bookend means a misread row passes silently. Emit ONE bookend for EACH
   closing figure the statement actually prints — the card's closing (step 6) and
   the points closing balance (step 5) — and NONE for a figure it doesn't print
   (never a fabricated figure, never a 0-amount opening pad). The points balance
   is the settled-pool total. **The closing total's Cr/Dr suffix maps DIRECTLY to the
   sign — a flat lookup, no reasoning:**
   - suffix **`Cr`** ⇒ write a **POSITIVE** number (e.g. `7500.00 INR`)
   - suffix **`Dr`**, or **no suffix** ⇒ write a **NEGATIVE** number (e.g. `-54321.00 INR`)

   Find the suffix on the closing total and apply the lookup — nothing else decides the
   sign. The suffix is INDEPENDENT of the transactions: a statement full of `Dr`
   purchases can still close `Cr`, and the purchase signs never change the closing
   balance's sign. The suffix sets ONLY the sign — the amount you write is ALWAYS
   `<number> <CURRENCY>` (CURRENCY = INR or the points ticker), and the Cr/Dr mark is
   NEVER the commodity; it never appears on the `balance` line.

   The closing `balance` is its OWN kind of line — NOT a card transaction leg: a
   purchase's card leg is negative because it adds to what you owe, but the closing
   balance is whatever the statement SAYS it is, by its suffix. E.g. a period ending 31
   May 2026 whose closing total carries a `Dr` suffix — ₹54,321 owed — and a
   12,500-point closing balance:

   ```
   2026-06-01 pad Liabilities:CreditCards:Skybank:Plus:1234 Equity:Void
   2026-06-01 balance Liabilities:CreditCards:Skybank:Plus:1234  -54321.00 INR

   2026-06-01 pad Assets:Rewards:Points:Skybank Equity:Void
   2026-06-01 balance Assets:Rewards:Points:Skybank  12500 SKYBANKPTS
   ```

   And a different card whose closing total carries a `Cr` suffix → POSITIVE by the
   lookup (amount 7,500.00, commodity INR — the `Cr` set the sign and is gone):

   ```
   2026-06-01 pad Liabilities:CreditCards:Harbor:Signature:5678 Equity:Void
   2026-06-01 balance Liabilities:CreditCards:Harbor:Signature:5678  7500.00 INR
   ```

Prefer the extracted TEXT for anything legible in it (dates, amounts, merchant
names); use the page IMAGES only for what the text is missing or garbles (labels
the bank renders as images, like the reward-points summary box). Do not echo or
restate the statement — the narration is the merchant / payee on the row.
