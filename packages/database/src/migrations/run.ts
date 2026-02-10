import { config } from 'dotenv';
import { promises as fs } from 'fs';
import { Kysely, Migrator, FileMigrationProvider, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import * as path from 'path';

// Load .env file from packages/database directory
config({ path: path.join(__dirname, '../../.env') });

async function migrateToLatest() {
  // Create db instance AFTER loading env variables
  const dialect = new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    }),
  });

  const db = new Kysely<any>({
    dialect,
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, '../../migrations'),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`✅ Migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === 'Error') {
      console.error(`❌ Failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error('❌ Failed to migrate');
    console.error(error);
    process.exit(1);
  }

  await db.destroy();
}

migrateToLatest();
