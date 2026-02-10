import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Enable pgmq extension
  await sql`CREATE EXTENSION IF NOT EXISTS pgmq CASCADE`.execute(db);

  console.log('✅ PGMQ extension enabled');
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP EXTENSION IF EXISTS pgmq CASCADE`.execute(db);
}
