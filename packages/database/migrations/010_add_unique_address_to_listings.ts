import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex('idx_listings_scrape_job_address_unique')
    .on('listings')
    .columns(['scrape_job_id', 'address'])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_listings_scrape_job_address_unique').execute();
}
