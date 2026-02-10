import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create enums first
  await sql`CREATE TYPE listing_status AS ENUM ('ACTIVE', 'RESERVED', 'CALLED_OFF')`.execute(db);
  await sql`CREATE TYPE tenure AS ENUM ('NONE', 'FREEHOLD', 'LEASEHOLD')`.execute(db);

  // Create listings table
  await db.schema
    .createTable('listings')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('address', 'text', (col) => col.notNull())
    .addColumn('home_type', 'text', (col) => col.notNull())
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('RM'))
    .addColumn('price', sql`DECIMAL(15,2)`, (col) => col.notNull())
    .addColumn('market_value', sql`DECIMAL(15,2)`, (col) => col.notNull())
    .addColumn('auction_date', 'timestamptz', (col) => col.notNull())
    .addColumn('tenure', sql`tenure`, (col) => col.notNull())
    .addColumn('land_area', sql`DECIMAL(10,2)`, (col) => col.notNull())
    .addColumn('land_area_unit', 'text', (col) => col.notNull().defaultTo('sqft'))
    .addColumn('registered_investor', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('entry_created', 'timestamptz', (col) => col.notNull())
    .addColumn('status', sql`listing_status`, (col) => col.notNull())
    .addColumn('scrape_job_id', 'text', (col) => col.notNull().references('scrape_jobs.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  // Create indexes
  await db.schema
    .createIndex('idx_listings_scrape_job_id')
    .on('listings')
    .column('scrape_job_id')
    .execute();

  await db.schema
    .createIndex('idx_listings_auction_date')
    .on('listings')
    .column('auction_date')
    .execute();

  await db.schema
    .createIndex('idx_listings_status')
    .on('listings')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_listings_home_type')
    .on('listings')
    .column('home_type')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('listings').execute();
  await sql`DROP TYPE IF EXISTS listing_status`.execute(db);
  await sql`DROP TYPE IF EXISTS tenure`.execute(db);
}
