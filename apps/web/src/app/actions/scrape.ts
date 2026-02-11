'use server';

import { db } from '@repo/database';
import { getSessionUser, getSession } from './_auth';

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
  // Get session for access token — backend validates the JWT itself
  const session = await getSession();
  if (!session) {
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
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create scrape job');
    }
    throw new Error(`Failed to create scrape job (HTTP ${response.status})`);
  }

  return response.json();
}

export async function getScrapeJobs(): Promise<ScrapeJob[]> {
  const user = await getSessionUser();
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
