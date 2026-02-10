import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Drop pg-boss schema (includes all pgboss tables)
  await sql`DROP SCHEMA IF EXISTS pgboss CASCADE`.execute(db);

  console.log('✅ Dropped old pg-boss tables');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Cannot recreate pg-boss tables (would need pg-boss to do that)
  console.log('⚠️  Cannot rollback - pg-boss tables removal is permanent');
}
