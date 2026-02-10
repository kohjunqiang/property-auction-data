import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('scrape_jobs')
    .addColumn('total_records', 'integer')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('scrape_jobs')
    .dropColumn('total_records')
    .execute();
}
