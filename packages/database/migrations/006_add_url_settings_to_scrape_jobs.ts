import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('scrape_jobs')
    .addColumn('url', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .alterTable('scrape_jobs')
    .addColumn('settings', 'jsonb')
    .execute();

  console.log('✅ Added url and settings columns to scrape_jobs table');
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('scrape_jobs')
    .dropColumn('url')
    .execute();

  await db.schema
    .alterTable('scrape_jobs')
    .dropColumn('settings')
    .execute();
}
