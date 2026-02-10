'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface ScrapeJob {
  id: string;
  url: string;
  user_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  items_found: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

type ScrapeJobPayload = RealtimePostgresChangesPayload<ScrapeJob>;

export function useScrapeJobUpdates(
  userId: string | undefined,
  onUpdate: (payload: ScrapeJobPayload) => void
) {
  const stableOnUpdate = useCallback(onUpdate, [onUpdate]);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`scrape_jobs_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scrape_jobs',
          filter: `user_id=eq.${userId}`,
        },
        stableOnUpdate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, stableOnUpdate]);
}
