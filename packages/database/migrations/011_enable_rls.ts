import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Enable RLS on all public tables
  await sql`ALTER TABLE users ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE listings ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE kysely_migration ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE kysely_migration_lock ENABLE ROW LEVEL SECURITY`.execute(db);

  // Policies for authenticated users via PostgREST (Supabase auth.uid())
  // Note: Kysely uses the db owner role which bypasses RLS entirely.

  // users: authenticated users can only read their own row
  await sql`
    CREATE POLICY "users_select_own" ON users
      FOR SELECT TO authenticated
      USING (auth_uid = auth.uid()::text)
  `.execute(db);

  // scrape_jobs: authenticated users can only read their own jobs
  await sql`
    CREATE POLICY "scrape_jobs_select_own" ON scrape_jobs
      FOR SELECT TO authenticated
      USING (user_id IN (SELECT id FROM users WHERE auth_uid = auth.uid()::text))
  `.execute(db);

  // listings: authenticated users can only read listings from their own scrape jobs
  await sql`
    CREATE POLICY "listings_select_own" ON listings
      FOR SELECT TO authenticated
      USING (scrape_job_id IN (
        SELECT sj.id FROM scrape_jobs sj
        INNER JOIN users u ON u.id = sj.user_id
        WHERE u.auth_uid = auth.uid()::text
      ))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop policies
  await sql`DROP POLICY IF EXISTS "listings_select_own" ON listings`.execute(db);
  await sql`DROP POLICY IF EXISTS "scrape_jobs_select_own" ON scrape_jobs`.execute(db);
  await sql`DROP POLICY IF EXISTS "users_select_own" ON users`.execute(db);

  // Disable RLS
  await sql`ALTER TABLE kysely_migration_lock DISABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE kysely_migration DISABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE listings DISABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE scrape_jobs DISABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE users DISABLE ROW LEVEL SECURITY`.execute(db);
}
