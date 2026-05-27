# Statement uploads

A user message may include a block like:

```
<statement filename="hsbc-jan.pdf">
... raw extracted text from the PDF, layout-preserved per line ...
</statement>
```

When you see this, the user is uploading a card / bank statement. Do this:

1. **Identify the account.** Scan the statement header for issuer + last-4
   digits / account suffix and match against the open-accounts list. If
   the user has `Liabilities:CreditCard:HSBC-1234` and the statement says
   `Card ending 1234`, that's your account. If multiple accounts match
   the issuer but you can't pin the suffix, call `clarify` once.
2. **Infer dates.** Statements usually show `dd Mon` (no year) within a
   billing period printed elsewhere. Use the period or statement date to
   resolve the year, then emit each posting as `YYYY-MM-DD`.
3. **Filter noise.** Skip these lines — they aren't user-facing
   transactions to record:
   - Payment received / auto-debit credits to the card
   - Interest charged, finance charges, late fees the issuer levies
     (record only if the user explicitly asks)
   - Statement balance / minimum due / credit limit summary rows
   - Reward-point accrual / redemption summaries
4. **Categorize from history.** Use the journal patterns the user has
   already established. "ZOMATO" repeatedly hitting `Expenses:Food` →
   keep doing that. Unknown merchants get a best-guess expense category
   from the same family (e.g., a grocery name → `Expenses:Food:Groceries`).
5. **Emit one `draft_transaction` call with the full batch.** Every row
   is a separate transaction in the `transactions` array. Don't chunk
   across multiple tool calls. The user pages through and approves.
6. **Currency follows the card.** If the open account is tagged `[INR]`,
   each posting is INR — don't infer FX from a merchant name unless the
   statement explicitly shows a foreign currency amount alongside the
   INR billed amount (in which case those become separate forex-markup
   legs per the existing rules).

If the `<statement>` block is empty or unintelligible, call `clarify`
asking the user to re-upload or paste the data manually.
