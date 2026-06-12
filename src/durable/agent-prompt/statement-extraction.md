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
     record each as a plain two-posting expense (`Expenses:Financial:Interest`,
     `Expenses:Financial:Fees`, `Expenses:Financial:GST`) + the card leg — never with
     points legs. Do NOT skip them (the closing balance won't reconcile)
     and do NOT duplicate a row: each printed line is exactly ONE entry.

   A **forex-markup fee** and its **GST** that follow a foreign-currency
   charge are NOT noise and are NOT standalone transactions — fold them
   into the charge they belong to (see the forex-folding rule below). Never emit a bare
   `"GST"` or `"FOREIGN CURRENCY TRANSACTION FEE"` entry of its own.
5. **Categorize.** First pick the best-fitting account from the user's
   open-accounts list (e.g. a grocery name → an existing `Expenses:Food:*`).
   When nothing in the list fits, create the account under one of the TEN
   canonical expense roots — never invent your own root:
   `Expenses:Housing` (rent, utilities, repairs), `Expenses:Food`,
   `Expenses:Transport` (fuel, ride-share, parking, vehicle service),
   `Expenses:Health` (doctor, pharmacy, gym), `Expenses:Shopping`,
   `Expenses:Entertainment`, `Expenses:Personal` (grooming, education,
   subscriptions), `Expenses:Financial` (fees, interest, taxes, FX markup),
   `Expenses:Travel`, `Expenses:Misc`. Map to the nearest root — a medical
   bill → `Expenses:Health`, fuel/vehicle → `Expenses:Transport`, a utility →
   `Expenses:Housing`, any fee/tax/markup → `Expenses:Financial`; add a second
   level for the specifics (`Expenses:Health:Pharmacy`). NEVER emit a
   non-canonical root like `Expenses:Medical`, `Expenses:Automotive`,
   `Expenses:Utilities`, `Expenses:Bank`, or `Expenses:Tax`. Don't invent
   receivables or equity plugs that aren't in the list.
6. **Currency follows the card.** If the open account is tagged
   `[INR]`, each posting is INR — don't infer FX from a merchant name
   unless the statement explicitly shows a foreign currency amount
   alongside the INR billed amount (in which case those become
   separate forex-markup legs per the existing rules).
7. **Fold forex fee + GST into the charge.** A foreign-currency row prints
   **two different amounts in two different places**: the **transaction
   amount in the foreign currency**, inside the `( CCY x.xx )` bracket next
   to the merchant (e.g. `( USD 9.28 )` → `9.28 USD`), and the **billed
   amount in the card's own billing currency**, as the row's main amount on
   the right. They are NOT the same number and are **never equal** — two
   currencies don't convert 1:1, so the foreign amount is always far smaller
   (or larger) than the billed amount. The foreign amount is the posting's
   quantity + commodity; the billed amount is the `@@` total. NEVER copy the
   billed amount into the foreign slot (or vice-versa) — read each from its
   own place.
   The "FOREIGN CURRENCY TRANSACTION FEE" / "DCC MARKUP" and "GST" rows that
   follow the charge belong to it — emit ONE transaction: the foreign amount
   `@@` the **billed amount exactly as printed** (do not re-derive it), plus
   the markup and GST as legs in the billing currency, with the card debited
   for the sum. Pair stray fee/GST rows to their charge by the **arithmetic,
   NOT by which row sits nearest.** When several foreign charges fall close
   together the bank often prints all their fees and GSTs interleaved and
   out of order — a GST can appear before its own markup, and two charges'
   fees/GSTs can be mixed on the same date. Match by the chain: a charge's
   markup is ≈ 2% of ITS billed amount, and its GST is ≈ 18% of THAT markup.
   So tie each markup to the charge it's 2% of, then tie each GST to the
   markup it's 18% of — never just grab the next fee/GST row in sequence. A
   GST that is not ~18% of the markup you paired to the same charge means
   you grabbed the wrong row. See the worked forex example.
8. **Credits are refunds.** A `Cr` row that isn't a bill payment reverses
   a purchase: negative expense leg, positive card leg. Keep each `Cr`
   row as its own transaction — never net two together or fold a refund
   into a receivable.
9. **Every eligible spend carries its points legs.** For a credit-card
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
   BONUS / PROMO points (a 5X promo, milestone, or sign-up reward — usually
   listed in a rewards-program summary, not on a purchase row) are EARNED too.
   Accrue each such line to `:Pending` with an `Equity:Void` contra, exactly like
   a spend's points (`<pool.account>:Pending +<bonus>` / `Equity:Void −<bonus>`,
   same ticker, dated the statement close).
   RECONCILE to the stated "Earned this cycle": the total you accrue — per-spend
   base points PLUS every bonus line — must EQUAL that figure exactly. If you
   fall short you missed a bonus (or a spend) — add it. DEDUPE: never count a
   bonus twice — if it's already inside a transaction's points, or listed in two
   places, accrue it ONCE; the total must never EXCEED Earned. Earned is the
   ground truth. Every earned point reaches `:Pending` before the landing moves
   it out, so after the landing `:Pending` nets to ZERO and is never negative.
   Issuer fees never earn: interest, finance charges, late fees, and
   standalone GST (all under `Expenses:Financial:*`) carry NO points legs.
   REFUNDS REVERSE THEIR POINTS with mirrored signs — same four-posting
   shape, points computed on the refunded amount:
   `Expenses:… -877.82 INR / card +877.82 INR /
   <pool>:Pending -48 <TICKER> / Equity:Void +48 <TICKER>`
   (floor(877.82/200)×12 = 48). Omit the points legs entirely when they
   compute to zero (spend below one earning block) — never emit a `0`
   points leg. A spend OR refund entry missing its points legs is
   INCOMPLETE unless the guide gave you no rate at all — and then you must
   tell the user you skipped accruals.
10. **The points summary (almost every statement prints one).** Look for the
   reward/loyalty points summary — usually "Reward Points — Opening / Earned /
   Redeemed / Closing", or a "Points Balance". Two entries from it:
   - **EARNED → move it.** If it states the points EARNED this cycle (a number,
     call it N), emit exactly ONE `transaction` that moves N points from
     `<pool.account>:Pending` to `<pool.account>` — `<pool.account>` +N,
     `<pool.account>:Pending` −N, same ticker, NO `Equity:Void`, NO price,
     dated the statement close. Whenever an Earned figure is printed, ALWAYS
     emit this move. (This is the only way to post pending points; a pad can't.)
   - **BALANCE → assert it (pad + balance, printed figure VERBATIM).** Whenever
     the statement prints a points balance — the "Closing" in a Reward Points
     summary, or a standalone "Points Balance" / "Balance as on date" — ALWAYS
     emit ONE `balance` for `<pool.account>` in `<pool.ticker>` using that
     printed number **exactly as shown**. Do NOT derive it from opening +
     earned, and do NOT add the earned points to it — copy what the summary box
     prints (that is the closing; deriving it is what produces a wrong total).
     Like the card's closing balance it is a **pad + balance**: the pad absorbs
     any gap between the printed total and what your earn/landing entries
     posted, so assert the printed truth and let the pad reconcile. Date it the
     statement close. Points, never rupees. This is INDEPENDENT of the move
     above — emit it whenever a balance is printed, even when no Earned figure
     is given and the points stay in `:Pending`.
     EXACTLY ONE points balance — the account's closing/current total. The other
     numbers in a points summary (points earned, redeemed, expiring, lapsed) are
     flows or counts, NOT balances — never assert one as a second balance, and
     never manufacture a balance (especially a 0) from a non-balance figure. A 0
     balance is right only if the pool genuinely closes at zero.
11. **Assert ONLY the statement's CLOSING balance** (one per card). Do NOT
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
   EXACTLY ONE closing balance per card — the closing outstanding. Never a second
   balance: not on an adjacent date, and not manufactured from a non-balance
   figure (a minimum due, a zeroed sub-total). One balance per account, full stop.
   SIGNS — read the Dr/Cr marker: amount OWED to the bank (normal "Dr") →
   NEGATIVE (e.g. "Net Outstanding 8,500.00" → -8500.00 INR); a "Cr" balance
   (bank owes you — overpayment/refund) → POSITIVE (e.g. "5,432.10 Cr" →
   +5432.10).
   The pad+balance pair is ONE element. Copy the figure digit-for-digit.
12. **One transaction per element.** Each entry is a complete Beancount
   block — header line plus 2+ postings, no leading/trailing blank
   lines, no comments narrating what the row is for. The postings
   must balance per currency under Beancount weight rules (`@@` puts
   the total in the price currency; `@` is per-unit).

Do not echo, summarize, or restate the statement text — `narration` should be
the merchant / payee as it appears on the row, not a paragraph about it.
