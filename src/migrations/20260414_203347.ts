import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`txns\` ADD \`user_id\` integer NOT NULL REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`txns_user_idx\` ON \`txns\` (\`user_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_txns\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`flag\` text DEFAULT '*' NOT NULL,
  	\`payee\` text,
  	\`narration\` text,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`INSERT INTO \`__new_txns\`("id", "date", "flag", "payee", "narration", "metadata", "updated_at", "created_at") SELECT "id", "date", "flag", "payee", "narration", "metadata", "updated_at", "created_at" FROM \`txns\`;`)
  await db.run(sql`DROP TABLE \`txns\`;`)
  await db.run(sql`ALTER TABLE \`__new_txns\` RENAME TO \`txns\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`txns_date_idx\` ON \`txns\` (\`date\`);`)
  await db.run(sql`CREATE INDEX \`txns_updated_at_idx\` ON \`txns\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`txns_created_at_idx\` ON \`txns\` (\`created_at\`);`)
}
