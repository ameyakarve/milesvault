import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`commodities\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`code\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`kind\` text NOT NULL,
  	\`issuer\` text,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`commodities_code_idx\` ON \`commodities\` (\`code\`);`)
  await db.run(sql`CREATE INDEX \`commodities_updated_at_idx\` ON \`commodities\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`commodities_created_at_idx\` ON \`commodities\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`accounts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`path\` text NOT NULL,
  	\`type\` text NOT NULL,
  	\`default_commodity_id\` integer,
  	\`open_date\` text NOT NULL,
  	\`close_date\` text,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`default_commodity_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`accounts_path_idx\` ON \`accounts\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`accounts_default_commodity_idx\` ON \`accounts\` (\`default_commodity_id\`);`)
  await db.run(sql`CREATE INDEX \`accounts_updated_at_idx\` ON \`accounts\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`accounts_created_at_idx\` ON \`accounts\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`txns_postings\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`account_id\` integer NOT NULL,
  	\`amount\` numeric NOT NULL,
  	\`commodity_id\` integer NOT NULL,
  	\`price_total_value\` numeric,
  	\`price_commodity_id\` integer,
  	\`metadata\` text,
  	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`commodity_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`price_commodity_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`txns\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`txns_postings_order_idx\` ON \`txns_postings\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_parent_id_idx\` ON \`txns_postings\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_account_idx\` ON \`txns_postings\` (\`account_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_commodity_idx\` ON \`txns_postings\` (\`commodity_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_price_commodity_idx\` ON \`txns_postings\` (\`price_commodity_id\`);`)
  await db.run(sql`CREATE TABLE \`txns\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`type\` text NOT NULL,
  	\`payee\` text,
  	\`narration\` text,
  	\`source\` text DEFAULT 'manual',
  	\`external_id\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`txns_date_idx\` ON \`txns\` (\`date\`);`)
  await db.run(sql`CREATE INDEX \`txns_type_idx\` ON \`txns\` (\`type\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`txns_external_id_idx\` ON \`txns\` (\`external_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_updated_at_idx\` ON \`txns\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`txns_created_at_idx\` ON \`txns\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`txns_texts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`text\` text,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`txns\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`txns_texts_order_parent\` ON \`txns_texts\` (\`order\`,\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`commodities_id\` integer REFERENCES commodities(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`accounts_id\` integer REFERENCES accounts(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`txns_id\` integer REFERENCES txns(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_commodities_id_idx\` ON \`payload_locked_documents_rels\` (\`commodities_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_accounts_id_idx\` ON \`payload_locked_documents_rels\` (\`accounts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_txns_id_idx\` ON \`payload_locked_documents_rels\` (\`txns_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`commodities\`;`)
  await db.run(sql`DROP TABLE \`accounts\`;`)
  await db.run(sql`DROP TABLE \`txns_postings\`;`)
  await db.run(sql`DROP TABLE \`txns\`;`)
  await db.run(sql`DROP TABLE \`txns_texts\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
}
