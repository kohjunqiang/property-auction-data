'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { db } from '@repo/database';

export interface ScrapeJob {
  id: string;
  url: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error: string | null;
  totalRecords: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function startScrape() {
  // Get authenticated session
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

  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    throw new Error('Not authenticated');
  }

  // Verify the user is authentic (getSession reads from cookies, getUser validates with server)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Call API with JWT token - no body needed, URL is fetched from user settings
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/scrapes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create scrape job');
  }

  return response.json();
}

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

  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

export async function getScrapeJobs(): Promise<ScrapeJob[]> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const jobs = await db
    .selectFrom('scrape_jobs')
    .selectAll()
    .where('user_id', '=', user.id)
    .orderBy('created_at', 'desc')
    .limit(20)
    .execute();

  return jobs.map(job => ({
    id: job.id,
    url: job.url,
    status: job.status as ScrapeJob['status'],
    error: job.error ?? null,
    totalRecords: job.total_records ?? null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  }));
}
