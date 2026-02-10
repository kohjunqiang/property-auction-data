import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create enum for credential status
  await sql`CREATE TYPE creds_status AS ENUM ('unknown', 'working', 'failed')`.execute(db);

  await db.schema
    .alterTable('users')
    .addColumn('creds_status', sql`creds_status`, (col) => col.defaultTo('unknown').notNull())
    .execute();

  await db.schema
    .alterTable('users')
    .addColumn('creds_status_updated_at', 'timestamptz')
    .execute();

  console.log('✅ Added creds_status and creds_status_updated_at columns to users table');
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .dropColumn('creds_status')
    .execute();

  await db.schema
    .alterTable('users')
    .dropColumn('creds_status_updated_at')
    .execute();

  await sql`DROP TYPE creds_status`.execute(db);
}
