import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('creds_encrypted', 'boolean', (col) => col.defaultTo(false).notNull())
    .execute();

  console.log('✅ Added creds_encrypted column to users table');
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .dropColumn('creds_encrypted')
    .execute();
}
