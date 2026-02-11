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
 * Validated auth via getUser() — contacts Supabase server to verify JWT.
 */
export async function getSessionUser() {
  const cookieStore = await cookies();
  const supabase = createSupabaseClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

export const getVerifiedUser = getSessionUser;

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
