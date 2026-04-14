import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`accounts_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`commodities_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`commodities_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`accounts_rels_order_idx\` ON \`accounts_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`accounts_rels_parent_idx\` ON \`accounts_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`accounts_rels_path_idx\` ON \`accounts_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`accounts_rels_commodities_id_idx\` ON \`accounts_rels\` (\`commodities_id\`);`)
  await db.run(sql`CREATE TABLE \`prices\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`base_id\` integer NOT NULL,
  	\`amount_number\` numeric NOT NULL,
  	\`amount_commodity_id\` integer NOT NULL,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`base_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`amount_commodity_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`prices_date_idx\` ON \`prices\` (\`date\`);`)
  await db.run(sql`CREATE INDEX \`prices_base_idx\` ON \`prices\` (\`base_id\`);`)
  await db.run(sql`CREATE INDEX \`prices_amount_commodity_idx\` ON \`prices\` (\`amount_commodity_id\`);`)
  await db.run(sql`CREATE INDEX \`prices_updated_at_idx\` ON \`prices\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`prices_created_at_idx\` ON \`prices\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`balances\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`account_id\` integer NOT NULL,
  	\`amount_number\` numeric NOT NULL,
  	\`amount_commodity_id\` integer NOT NULL,
  	\`tolerance\` numeric,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`amount_commodity_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`balances_date_idx\` ON \`balances\` (\`date\`);`)
  await db.run(sql`CREATE INDEX \`balances_account_idx\` ON \`balances\` (\`account_id\`);`)
  await db.run(sql`CREATE INDEX \`balances_amount_commodity_idx\` ON \`balances\` (\`amount_commodity_id\`);`)
  await db.run(sql`CREATE INDEX \`balances_updated_at_idx\` ON \`balances\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`balances_created_at_idx\` ON \`balances\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`pads\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`account_id\` integer NOT NULL,
  	\`account_pad_id\` integer NOT NULL,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`account_pad_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`pads_date_idx\` ON \`pads\` (\`date\`);`)
  await db.run(sql`CREATE INDEX \`pads_account_idx\` ON \`pads\` (\`account_id\`);`)
  await db.run(sql`CREATE INDEX \`pads_account_pad_idx\` ON \`pads\` (\`account_pad_id\`);`)
  await db.run(sql`CREATE INDEX \`pads_updated_at_idx\` ON \`pads\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`pads_created_at_idx\` ON \`pads\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`notes\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`account_id\` integer NOT NULL,
  	\`description\` text NOT NULL,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`notes_date_idx\` ON \`notes\` (\`date\`);`)
  await db.run(sql`CREATE INDEX \`notes_account_idx\` ON \`notes\` (\`account_id\`);`)
  await db.run(sql`CREATE INDEX \`notes_updated_at_idx\` ON \`notes\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`notes_created_at_idx\` ON \`notes\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`documents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`account_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`documents_date_idx\` ON \`documents\` (\`date\`);`)
  await db.run(sql`CREATE INDEX \`documents_account_idx\` ON \`documents\` (\`account_id\`);`)
  await db.run(sql`CREATE INDEX \`documents_updated_at_idx\` ON \`documents\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`documents_created_at_idx\` ON \`documents\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`value\` text NOT NULL,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`events_date_idx\` ON \`events\` (\`date\`);`)
  await db.run(sql`CREATE INDEX \`events_name_idx\` ON \`events\` (\`name\`);`)
  await db.run(sql`CREATE INDEX \`events_updated_at_idx\` ON \`events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`events_created_at_idx\` ON \`events\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`queries\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`sql\` text NOT NULL,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`queries_updated_at_idx\` ON \`queries\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`queries_created_at_idx\` ON \`queries\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`customs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`type_name\` text NOT NULL,
  	\`values\` text,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`customs_date_idx\` ON \`customs\` (\`date\`);`)
  await db.run(sql`CREATE INDEX \`customs_type_name_idx\` ON \`customs\` (\`type_name\`);`)
  await db.run(sql`CREATE INDEX \`customs_updated_at_idx\` ON \`customs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`customs_created_at_idx\` ON \`customs\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`options\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`value\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`options_name_idx\` ON \`options\` (\`name\`);`)
  await db.run(sql`CREATE INDEX \`options_updated_at_idx\` ON \`options\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`options_created_at_idx\` ON \`options\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`plugins\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`module_name\` text NOT NULL,
  	\`config_string\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`plugins_updated_at_idx\` ON \`plugins\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`plugins_created_at_idx\` ON \`plugins\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`includes\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`filename\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`includes_updated_at_idx\` ON \`includes\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`includes_created_at_idx\` ON \`includes\` (\`created_at\`);`)
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
  await db.run(sql`CREATE TABLE \`__new_txns_postings\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`flag\` text,
  	\`account_id\` integer NOT NULL,
  	\`amount_number\` numeric,
  	\`amount_commodity_id\` integer,
  	\`cost_kind\` text,
  	\`cost_number\` numeric,
  	\`cost_commodity_id\` integer,
  	\`cost_date\` text,
  	\`cost_label\` text,
  	\`price_kind\` text,
  	\`price_number\` numeric,
  	\`price_commodity_id\` integer,
  	\`metadata\` text,
  	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`amount_commodity_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`cost_commodity_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`price_commodity_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`txns\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_txns_postings\`("_order", "_parent_id", "id", "flag", "account_id", "amount_number", "amount_commodity_id", "cost_kind", "cost_number", "cost_commodity_id", "cost_date", "cost_label", "price_kind", "price_number", "price_commodity_id", "metadata") SELECT "_order", "_parent_id", "id", "flag", "account_id", "amount_number", "amount_commodity_id", "cost_kind", "cost_number", "cost_commodity_id", "cost_date", "cost_label", "price_kind", "price_number", "price_commodity_id", "metadata" FROM \`txns_postings\`;`)
  await db.run(sql`DROP TABLE \`txns_postings\`;`)
  await db.run(sql`ALTER TABLE \`__new_txns_postings\` RENAME TO \`txns_postings\`;`)
  await db.run(sql`CREATE INDEX \`txns_postings_order_idx\` ON \`txns_postings\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_parent_id_idx\` ON \`txns_postings\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_account_idx\` ON \`txns_postings\` (\`account_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_amount_commodity_idx\` ON \`txns_postings\` (\`amount_commodity_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_cost_cost_commodity_idx\` ON \`txns_postings\` (\`cost_commodity_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_price_price_commodity_idx\` ON \`txns_postings\` (\`price_commodity_id\`);`)
  await db.run(sql`DROP INDEX \`txns_type_idx\`;`)
  await db.run(sql`DROP INDEX \`txns_external_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`txns\` ADD \`flag\` text DEFAULT '*' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`txns\` ADD \`metadata\` text;`)
  await db.run(sql`ALTER TABLE \`txns\` DROP COLUMN \`type\`;`)
  await db.run(sql`ALTER TABLE \`txns\` DROP COLUMN \`source\`;`)
  await db.run(sql`ALTER TABLE \`txns\` DROP COLUMN \`external_id\`;`)
  await db.run(sql`ALTER TABLE \`commodities\` ADD \`open_date\` text NOT NULL;`)
  await db.run(sql`ALTER TABLE \`commodities\` ADD \`metadata\` text;`)
  await db.run(sql`ALTER TABLE \`commodities\` DROP COLUMN \`name\`;`)
  await db.run(sql`ALTER TABLE \`commodities\` DROP COLUMN \`kind\`;`)
  await db.run(sql`ALTER TABLE \`commodities\` DROP COLUMN \`issuer\`;`)
  await db.run(sql`ALTER TABLE \`commodities\` DROP COLUMN \`notes\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`prices_id\` integer REFERENCES prices(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`balances_id\` integer REFERENCES balances(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`pads_id\` integer REFERENCES pads(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`notes_id\` integer REFERENCES notes(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`documents_id\` integer REFERENCES documents(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`events_id\` integer REFERENCES events(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`queries_id\` integer REFERENCES queries(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`customs_id\` integer REFERENCES customs(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`options_id\` integer REFERENCES options(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`plugins_id\` integer REFERENCES plugins(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`includes_id\` integer REFERENCES includes(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_prices_id_idx\` ON \`payload_locked_documents_rels\` (\`prices_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_balances_id_idx\` ON \`payload_locked_documents_rels\` (\`balances_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_pads_id_idx\` ON \`payload_locked_documents_rels\` (\`pads_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_notes_id_idx\` ON \`payload_locked_documents_rels\` (\`notes_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_documents_id_idx\` ON \`payload_locked_documents_rels\` (\`documents_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_events_id_idx\` ON \`payload_locked_documents_rels\` (\`events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_queries_id_idx\` ON \`payload_locked_documents_rels\` (\`queries_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_customs_id_idx\` ON \`payload_locked_documents_rels\` (\`customs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_options_id_idx\` ON \`payload_locked_documents_rels\` (\`options_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_plugins_id_idx\` ON \`payload_locked_documents_rels\` (\`plugins_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_includes_id_idx\` ON \`payload_locked_documents_rels\` (\`includes_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_texts_text_idx\` ON \`txns_texts\` (\`text\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`accounts_rels\`;`)
  await db.run(sql`DROP TABLE \`prices\`;`)
  await db.run(sql`DROP TABLE \`balances\`;`)
  await db.run(sql`DROP TABLE \`pads\`;`)
  await db.run(sql`DROP TABLE \`notes\`;`)
  await db.run(sql`DROP TABLE \`documents\`;`)
  await db.run(sql`DROP TABLE \`events\`;`)
  await db.run(sql`DROP TABLE \`queries\`;`)
  await db.run(sql`DROP TABLE \`customs\`;`)
  await db.run(sql`DROP TABLE \`options\`;`)
  await db.run(sql`DROP TABLE \`plugins\`;`)
  await db.run(sql`DROP TABLE \`includes\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_txns_postings\` (
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
  await db.run(sql`INSERT INTO \`__new_txns_postings\`("_order", "_parent_id", "id", "account_id", "amount", "commodity_id", "price_total_value", "price_commodity_id", "metadata") SELECT "_order", "_parent_id", "id", "account_id", "amount", "commodity_id", "price_total_value", "price_commodity_id", "metadata" FROM \`txns_postings\`;`)
  await db.run(sql`DROP TABLE \`txns_postings\`;`)
  await db.run(sql`ALTER TABLE \`__new_txns_postings\` RENAME TO \`txns_postings\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`txns_postings_order_idx\` ON \`txns_postings\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_parent_id_idx\` ON \`txns_postings\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_account_idx\` ON \`txns_postings\` (\`account_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_commodity_idx\` ON \`txns_postings\` (\`commodity_id\`);`)
  await db.run(sql`CREATE INDEX \`txns_postings_price_commodity_idx\` ON \`txns_postings\` (\`price_commodity_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`commodities_id\` integer,
  	\`accounts_id\` integer,
  	\`txns_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`commodities_id\`) REFERENCES \`commodities\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`accounts_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`txns_id\`) REFERENCES \`txns\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "commodities_id", "accounts_id", "txns_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "commodities_id", "accounts_id", "txns_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_commodities_id_idx\` ON \`payload_locked_documents_rels\` (\`commodities_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_accounts_id_idx\` ON \`payload_locked_documents_rels\` (\`accounts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_txns_id_idx\` ON \`payload_locked_documents_rels\` (\`txns_id\`);`)
  await db.run(sql`DROP INDEX \`txns_texts_text_idx\`;`)
  await db.run(sql`ALTER TABLE \`commodities\` ADD \`name\` text NOT NULL;`)
  await db.run(sql`ALTER TABLE \`commodities\` ADD \`kind\` text NOT NULL;`)
  await db.run(sql`ALTER TABLE \`commodities\` ADD \`issuer\` text;`)
  await db.run(sql`ALTER TABLE \`commodities\` ADD \`notes\` text;`)
  await db.run(sql`ALTER TABLE \`commodities\` DROP COLUMN \`open_date\`;`)
  await db.run(sql`ALTER TABLE \`commodities\` DROP COLUMN \`metadata\`;`)
  await db.run(sql`ALTER TABLE \`accounts\` ADD \`default_commodity_id\` integer REFERENCES commodities(id);`)
  await db.run(sql`CREATE INDEX \`accounts_default_commodity_idx\` ON \`accounts\` (\`default_commodity_id\`);`)
  await db.run(sql`ALTER TABLE \`accounts\` DROP COLUMN \`booking_method\`;`)
  await db.run(sql`ALTER TABLE \`txns\` ADD \`type\` text NOT NULL;`)
  await db.run(sql`ALTER TABLE \`txns\` ADD \`source\` text DEFAULT 'manual';`)
  await db.run(sql`ALTER TABLE \`txns\` ADD \`external_id\` text;`)
  await db.run(sql`CREATE INDEX \`txns_type_idx\` ON \`txns\` (\`type\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`txns_external_id_idx\` ON \`txns\` (\`external_id\`);`)
  await db.run(sql`ALTER TABLE \`txns\` DROP COLUMN \`flag\`;`)
  await db.run(sql`ALTER TABLE \`txns\` DROP COLUMN \`metadata\`;`)
}
