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
   them per the forex rule above).

   Each "FOREIGN CURRENCY TRANSACTION FEE", "DCC MARKUP", and "GST" row is its OWN
   standalone entry — a plain two-posting expense (`Expenses:Financial:…` + the
   card leg), with NO points legs. Do NOT fold a fee into the purchase entry (the
   purchase carries ONLY the merchant's own `<foreign> @@ <INR>` amount), and do
   NOT try to attach a fee to a particular purchase or pair it by position — these
   fee rows are routinely interleaved and printed out of order across several
   purchases, so any attempt to group them mislays one. Just transcribe EACH fee
   row, top to bottom, as one expense for exactly the amount printed — one entry
   per row, never merged, never duplicated, never skipped (a dropped row makes the
   closing fail to reconcile).

5. **Use the statement's printed reward figures.**
   - When the statement prints points PER ROW, use those numbers verbatim — they
     already bake in the card's category multipliers; don't re-derive from the
     base rate.
   - When it prints "Earned this cycle" (N), that is the landing amount (move N
     from `:Pending` to posted) and the figure your per-row accruals must
     reconcile to. This is the cycle's DELTA, NOT a balance — never assert it.
   - When — and ONLY when — it prints a CLOSING points balance (the pool's
     standing total), assert THAT number with a pad + balance, verbatim. It is
     printed two ways: (a) a single labelled value — "points balance as on
     <date>" / "total available points" / "Reward Points: <N>"; or (b) a
     RECONCILIATION block that lists Opening Balance + Points Earned (Feature /
     Bonus) − Redeemed / Disbursed / Adjusted / Lapsed. In case (b) the CLOSING
     balance is the TOTAL those rows resolve to — opening + earned − the
     deductions — usually printed as the "Reward Points" / "Total" / "Balance"
     figure heading the block; assert THAT total, NOT the Opening column and NOT
     the Earned column (it is larger than either). Whenever that total IS printed
     the bookend is REQUIRED — including when it appears only in the rewards
     summary box or the page image — do not skip it. Do not confuse it with
     "earned this cycle": closing balance = opening + earned − redeemed (the
     running total), a much larger number than the cycle's earnings. If the
     statement prints NO closing points balance, emit no points bookend (never
     fabricate or infer one).

6. **Assert the card's closing balance — when the statement prints one.** Most
   statements carry a SUMMARY box of TOTALS (Previous Balance · Purchases ·
   Payments · Net Outstanding / Total Payment Due) — use the "Net Outstanding" /
   "Total Payment Due" total, NOT a transaction amount, the minimum due, or the
   credit limit. Emit it as a pad + balance dated the day AFTER the statement
   period's last day. If the statement has no totals / amount-due box, emit no
   card bookend — don't reconstruct a figure.

7. **Pad + balance — the exact form.** A closing bookend is ALWAYS TWO lines — a
   `pad` naming the account with the `Equity:Void` plug, THEN a `balance` asserting
   the printed figure verbatim. **NEVER emit a bare `balance` (a `balance` line with
   no `pad` before it) for a statement closing** — a statement import ALWAYS drifts
   from the printed total (the opening balance, rounding, any row you didn't model
   exactly), so the `pad` is REQUIRED to absorb that drift; a bare balance will fail
   to reconcile. EVERY closing `balance` (card AND points) gets its OWN `pad` line
   immediately before it. A missing bookend means a misread row passes silently. Emit ONE bookend for EACH
   closing figure the statement actually prints — the card's closing (step 6) and
   the points closing balance (step 5) — and NONE for a figure it doesn't print
   (never a fabricated figure, never a 0-amount opening pad). The points balance
   is the settled-pool total. **Sign the CARD closing balance YOURSELF.** The
   statement prints the total as an unsigned MAGNITUDE (sometimes with a Cr/Dr
   marker); a credit card is a LIABILITY, so you add the sign by who owes whom:
   - **Owe the issuer** — a plain, "Dr", or unmarked total (the COMMON case) →
     **NEGATIVE**, write `-<amount>`. The statement prints the owed amount as a
     positive number; do NOT copy it as-is — an owed card balance is NEGATIVE.
   - **Overpaid** — the total is marked "Cr" → you owe NOTHING, the issuer owes
     YOU → **POSITIVE**, write `<amount>`. CHECK for this "Cr" BEFORE you sign: it
     OVERRIDES the box's label. A figure sitting under "Total Payment Due" / "Total
     Amount Due" but suffixed "Cr" is NOT due and NOT owed (its minimum-due reads
     0.00) — it is money in YOUR favour, so it is POSITIVE. Never let the word
     "Due" pull a minus onto a number the statement itself marks "Cr".

   The Cr/Dr marker decides the sign and is then dropped — it is NEVER the commodity;
   the amount is always `<number> <CURRENCY>` (INR or the points ticker). E.g. a
   period ending 31 May 2026 that prints ₹54,321 owed and a 12,500-point closing
   balance:

   ```
   2026-06-01 pad Liabilities:CreditCards:Skybank:Plus:1234 Equity:Void
   2026-06-01 balance Liabilities:CreditCards:Skybank:Plus:1234  -54321.00 INR

   2026-06-01 pad Assets:Rewards:Points:Skybank Equity:Void
   2026-06-01 balance Assets:Rewards:Points:Skybank  12500 SKYBANKPTS
   ```

   A worked case of the trap: a summary box printing `Total Payment Due  8,420.00
   Cr` with `Minimum Due  0.00 Cr` — the "Cr" means nothing is due and the issuer
   holds 8,420.00 of YOURS, so the closing is POSITIVE:

   ```
   2026-06-01 pad Liabilities:CreditCards:Brightpay:Elite:9012 Equity:Void
   2026-06-01 balance Liabilities:CreditCards:Brightpay:Elite:9012  8420.00 INR
   ```

   And a different card whose closing total carries a "Cr" suffix — overpaid, the
   issuer owes you 7,500.00 → the balance is POSITIVE, and the commodity is INR (the
   "Cr" set the sign and is gone), NOT negated:

   ```
   2026-06-01 pad Liabilities:CreditCards:Harbor:Signature:5678 Equity:Void
   2026-06-01 balance Liabilities:CreditCards:Harbor:Signature:5678  7500.00 INR
   ```

   Each closing bookend is the pad line AND the balance line — ✓ vs ✗:

   ```
   ✓  2026-06-01 pad Liabilities:CreditCards:Skybank:Plus:1234 Equity:Void
      2026-06-01 balance Liabilities:CreditCards:Skybank:Plus:1234  -54321.00 INR
   ✗  2026-06-01 balance Liabilities:CreditCards:Skybank:Plus:1234  -54321.00 INR   (bare — no pad above; a statement closing always drifts, so this fails to reconcile)
   ```

   And the SIGN — owed is NEGATIVE (the common case), a "Cr" (overpaid) closing is
   POSITIVE — ✓ vs ✗ in BOTH directions:

   ```
   ✓  owed (plain/Dr/unmarked):  balance Liabilities:CreditCards:Skybank:Plus:1234  -54321.00 INR
   ✗  owed written positive:     balance Liabilities:CreditCards:Skybank:Plus:1234   54321.00 INR
   ✓  overpaid ("Cr"):           balance Liabilities:CreditCards:Harbor:Signature:5678   7500.00 INR
   ✗  "Cr" written negative:     balance Liabilities:CreditCards:Harbor:Signature:5678  -7500.00 INR
   ```

The supplied TEXT is a layout extraction that silently DROPS or garbles whatever
the bank renders as a graphic (styled summary boxes, their labels, totals). Treat
the TEXT and the page IMAGES as two views of the same statement and compose your
working copy from BOTH — read each figure against the image, let the image supply
what the text dropped and the text confirm what the image shows. Neither alone is
complete. Do not echo or restate the statement — the narration is the merchant /
payee on the row.
