import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`UPDATE \`commodities\` SET \`code\` = 'AXIS_EDGE_MILES' WHERE \`code\` = 'AXIS_EDGE_REWARDS';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`UPDATE \`commodities\` SET \`code\` = 'AXIS_EDGE_REWARDS' WHERE \`code\` = 'AXIS_EDGE_MILES';`)
}
