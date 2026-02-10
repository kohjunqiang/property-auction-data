'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function createSupabaseClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
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
}

/**
 * Fast auth for read-only actions. Reads JWT from cookie (no network call).
 * Use for: getListings, getScrapeJobs, hasCredentialsConfigured, getCredentials
 */
export async function getSessionUser() {
  const cookieStore = await cookies();
  const supabase = createSupabaseClient(cookieStore);
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

/**
 * Secure auth for write actions. Validates JWT with Supabase server (network call).
 * Use for: startScrape, saveCredentials
 */
export async function getVerifiedUser() {
  const cookieStore = await cookies();
  const supabase = createSupabaseClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

/**
 * Get session with access token for forwarding to backend API.
 * Use for: startScrape (needs Bearer token for NestJS backend).
 */
export async function getSession() {
  const cookieStore = await cookies();
  const supabase = createSupabaseClient(cookieStore);
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
