# MilesVault — Claude Code instructions

## Data mutations: use Payload API, never D1

**Never** mutate data via D1 directly — no SQL `INSERT`/`UPDATE`/`DELETE` in migrations, no `wrangler d1 execute` for data changes. Migrations are for **schema** only (`ALTER TABLE`, `CREATE INDEX`, etc.).

For any data change (seeding, renaming a row, fixing a value, bulk updates), use the Payload REST API against `https://milesvault.ameyakarve.workers.dev/api/...` with a JWT obtained via `POST /api/users/login`.

If an API mutation is blocked by access control, fix the access control (or use the admin escape hatch) rather than bypassing it with raw SQL.

## Admin user

User id `1` (`ameya.karve@gmail.com`) is hardcoded as the admin. Collections that expose globals (e.g. `commodities`) grant this id unrestricted update/delete via an `ADMIN_USER_ID` constant. When adding new collections with global rows, follow the same pattern.

## Environment

- D1 database: `c5e6c9e1-6020-4772-a568-714a57e0bf0f`
- Cloudflare account: `e0bc1f55dc6fc3f8fe870087199a2ee3`
- Worker URL: `https://milesvault.ameyakarve.workers.dev`
- Deploy: push to `main` → GitHub Actions runs `pnpm run deploy` which runs `payload migrate` then `opennextjs-cloudflare deploy`
- Push with `env -u GH_TOKEN git push` (fine-grained PAT lacks repo access)
