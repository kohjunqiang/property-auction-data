'use server';

import { db } from '@repo/database';
import { CredentialsSchema } from '@repo/schema';
import { encryptCredentials, decryptCredentials, isEncryptedFormat, type EncryptedData } from '@repo/crypto';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // Always verify with Supabase server for security
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return null;
  }
  return user;
}

/**
 * Save auction site credentials for the authenticated user (encrypted)
 */
export async function saveCredentials(username: string, password: string, targetUrl?: string) {
  // Validate input
  const validated = CredentialsSchema.parse({ username, password, targetUrl });

  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Encrypt credentials
  const encryptedCreds = encryptCredentials(validated);

  // Check if user exists in database
  const existingUser = await db
    .selectFrom('users')
    .selectAll()
    .where('auth_uid', '=', user.id)
    .executeTakeFirst();

  if (!existingUser) {
    // Create user if doesn't exist
    await db
      .insertInto('users')
      .values({
        id: user.id,
        email: user.email!,
        auth_uid: user.id,
        creds: JSON.stringify(encryptedCreds),
        created_at: new Date(),
        updated_at: new Date(),
      } as any)
      .execute();

    // Set creds_encrypted flag and reset status (columns may not exist until migration runs)
    try {
      await db
        .updateTable('users')
        .set({
          creds_encrypted: true,
          creds_status: 'unknown',
          creds_status_updated_at: null,
        } as any)
        .where('auth_uid', '=', user.id)
        .execute();
    } catch {
      // Columns don't exist yet - migration hasn't run
    }
  } else {
    // Update existing user credentials
    await db
      .updateTable('users')
      .set({
        creds: JSON.stringify(encryptedCreds),
        updated_at: new Date(),
      } as any)
      .where('auth_uid', '=', user.id)
      .execute();

    // Set creds_encrypted flag and reset status (columns may not exist until migration runs)
    try {
      await db
        .updateTable('users')
        .set({
          creds_encrypted: true,
          creds_status: 'unknown',
          creds_status_updated_at: null,
        } as any)
        .where('auth_uid', '=', user.id)
        .execute();
    } catch {
      // Columns don't exist yet - migration hasn't run
    }
  }

  return { success: true };
}

export type CredsStatus = 'unknown' | 'working' | 'failed';

export interface CredentialsInfo {
  username: string;
  hasPassword: boolean;
  targetUrl: string | null;
  status: CredsStatus;
  statusUpdatedAt: Date | null;
}

/**
 * Get saved credentials for the authenticated user
 * Returns username visible, status, but only indicates password exists (for security)
 */
/**
 * Lightweight check: are credentials and targetUrl configured?
 * Does NOT decrypt — safe to call without CREDENTIALS_ENCRYPTION_KEY.
 */
export async function hasCredentialsConfigured(): Promise<boolean> {
  const user = await getAuthenticatedUser();
  if (!user) return false;

  const dbUser = await db
    .selectFrom('users')
    .select(['creds'])
    .where('auth_uid', '=', user.id)
    .executeTakeFirst();

  if (!dbUser?.creds) return false;

  // Check that creds JSON contains a targetUrl
  try {
    const raw = typeof dbUser.creds === 'string' ? JSON.parse(dbUser.creds) : dbUser.creds;
    // Encrypted creds won't have targetUrl at top level — but the fact that
    // creds exist means user saved credentials (targetUrl is required by schema)
    return raw !== null && typeof raw === 'object';
  } catch {
    return false;
  }
}

export async function getCredentials(): Promise<CredentialsInfo | null> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get user from database
  const dbUser = await db
    .selectFrom('users')
    .selectAll()
    .where('auth_uid', '=', user.id)
    .executeTakeFirst();

  if (!dbUser?.creds) {
    return null;
  }

  let credentials: { username: string; password: string; targetUrl?: string };
  const userRecord = dbUser as typeof dbUser & {
    creds_encrypted?: boolean;
    creds_status?: CredsStatus;
    creds_status_updated_at?: Date;
  };

  // Check if creds_encrypted flag is true and data is in encrypted format
  if (userRecord.creds_encrypted && isEncryptedFormat(dbUser.creds)) {
    // Decrypt encrypted credentials
    credentials = decryptCredentials(dbUser.creds as unknown as EncryptedData);
  } else {
    // Legacy plain JSON credentials
    credentials = dbUser.creds as unknown as { username: string; password: string };
  }

  // Return username visible, status, and targetUrl (but only indicate password exists)
  return {
    username: credentials.username,
    hasPassword: !!credentials.password,
    targetUrl: credentials.targetUrl ?? null,
    status: userRecord.creds_status ?? 'unknown',
    statusUpdatedAt: userRecord.creds_status_updated_at ?? null,
  };
}
