import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Drop existing policies
  await sql`DROP POLICY "users_select_own" ON users`.execute(db);
  await sql`DROP POLICY "scrape_jobs_select_own" ON scrape_jobs`.execute(db);
  await sql`DROP POLICY "listings_select_own" ON listings`.execute(db);

  // Recreate with (select auth.uid()) to avoid per-row re-evaluation
  await sql`
    CREATE POLICY "users_select_own" ON users
      FOR SELECT TO authenticated
      USING (auth_uid = (select auth.uid())::text)
  `.execute(db);

  await sql`
    CREATE POLICY "scrape_jobs_select_own" ON scrape_jobs
      FOR SELECT TO authenticated
      USING (user_id IN (SELECT id FROM users WHERE auth_uid = (select auth.uid())::text))
  `.execute(db);

  await sql`
    CREATE POLICY "listings_select_own" ON listings
      FOR SELECT TO authenticated
      USING (scrape_job_id IN (
        SELECT sj.id FROM scrape_jobs sj
        INNER JOIN users u ON u.id = sj.user_id
        WHERE u.auth_uid = (select auth.uid())::text
      ))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop fixed policies
  await sql`DROP POLICY "users_select_own" ON users`.execute(db);
  await sql`DROP POLICY "scrape_jobs_select_own" ON scrape_jobs`.execute(db);
  await sql`DROP POLICY "listings_select_own" ON listings`.execute(db);

  // Recreate original policies without subquery wrapper
  await sql`
    CREATE POLICY "users_select_own" ON users
      FOR SELECT TO authenticated
      USING (auth_uid = auth.uid()::text)
  `.execute(db);

  await sql`
    CREATE POLICY "scrape_jobs_select_own" ON scrape_jobs
      FOR SELECT TO authenticated
      USING (user_id IN (SELECT id FROM users WHERE auth_uid = auth.uid()::text))
  `.execute(db);

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
