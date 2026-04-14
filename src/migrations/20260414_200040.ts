import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`commodities_code_idx\`;`)
  await db.run(sql`ALTER TABLE \`commodities\` ADD \`user_id\` integer REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`commodities_user_idx\` ON \`commodities\` (\`user_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`user_code_idx\` ON \`commodities\` (\`user_id\`,\`code\`);`)
  await db.run(sql`CREATE INDEX \`commodities_code_idx\` ON \`commodities\` (\`code\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_commodities\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`code\` text NOT NULL,
  	\`open_date\` text NOT NULL,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`INSERT INTO \`__new_commodities\`("id", "code", "open_date", "metadata", "updated_at", "created_at") SELECT "id", "code", "open_date", "metadata", "updated_at", "created_at" FROM \`commodities\`;`)
  await db.run(sql`DROP TABLE \`commodities\`;`)
  await db.run(sql`ALTER TABLE \`__new_commodities\` RENAME TO \`commodities\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`commodities_code_idx\` ON \`commodities\` (\`code\`);`)
  await db.run(sql`CREATE INDEX \`commodities_updated_at_idx\` ON \`commodities\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`commodities_created_at_idx\` ON \`commodities\` (\`created_at\`);`)
}
