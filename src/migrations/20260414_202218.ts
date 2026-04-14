import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`accounts_path_idx\`;`)
  await db.run(sql`ALTER TABLE \`accounts\` ADD \`user_id\` integer NOT NULL REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`accounts_user_idx\` ON \`accounts\` (\`user_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`user_path_idx\` ON \`accounts\` (\`user_id\`,\`path\`);`)
  await db.run(sql`CREATE INDEX \`accounts_path_idx\` ON \`accounts\` (\`path\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_accounts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`path\` text NOT NULL,
  	\`type\` text NOT NULL,
  	\`open_date\` text NOT NULL,
  	\`close_date\` text,
  	\`booking_method\` text DEFAULT 'STRICT',
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`INSERT INTO \`__new_accounts\`("id", "path", "type", "open_date", "close_date", "booking_method", "metadata", "updated_at", "created_at") SELECT "id", "path", "type", "open_date", "close_date", "booking_method", "metadata", "updated_at", "created_at" FROM \`accounts\`;`)
  await db.run(sql`DROP TABLE \`accounts\`;`)
  await db.run(sql`ALTER TABLE \`__new_accounts\` RENAME TO \`accounts\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`accounts_path_idx\` ON \`accounts\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`accounts_updated_at_idx\` ON \`accounts\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`accounts_created_at_idx\` ON \`accounts\` (\`created_at\`);`)
}
