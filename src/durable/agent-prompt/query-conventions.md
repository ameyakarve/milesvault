# Query conventions

You have a `sql_query(sql, params?)` tool. It runs read-only SQL against the
user's ledger SQLite. Engine-enforced: any write attempt errors out.

## Always

- Parameterize. Pass user values through `params`, never interpolate.
- `LIMIT` aggressively. Results are also capped at 1000 rows server-side;
  hitting the cap sets `truncated: true` and is a sign your query is too
  broad.
- Use `WHERE date BETWEEN ? AND ?` with **ordinal integers** (see encoding
  conventions). Today's ordinal is in the per-turn snapshot.
- Prefer joins over N+1.

## Avoid

- `SELECT *` in user-facing answers. Project the columns you'll cite.
- Float arithmetic on `amount` text. Use `amount_scaled` / `scale`.
- Repeatedly running the same query — cache the result in your reasoning.

## Patterns

- **Top spend by payee in a window:**
  ```sql
  SELECT t.payee, SUM(p.amount_scaled * 1.0 / POWER(10, p.scale)) AS total
  FROM postings p JOIN transactions t ON t.id = p.txn_id
  WHERE p.account LIKE 'Expenses:%'
    AND p.date BETWEEN ? AND ?
  GROUP BY t.payee
  ORDER BY total DESC
  LIMIT 20
  ```

- **Monthly totals for an account:**
  ```sql
  SELECT (p.date / 100) AS yyyymm,
         SUM(p.amount_scaled * 1.0 / POWER(10, p.scale)) AS total
  FROM postings p
  WHERE p.account = ?
  GROUP BY yyyymm
  ORDER BY yyyymm
  ```

- **Account currencies & open status:** query `directives_open` /
  `directives_close`. Prefer the snapshot's account list when the query is
  about the schema itself rather than transaction data.
