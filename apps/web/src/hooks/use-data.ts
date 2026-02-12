import useSWR, { mutate as globalMutate } from 'swr';
import { getScrapeJobs } from '@/app/actions/scrape';
import { getListings } from '@/app/actions/listings';
import { hasCredentialsConfigured } from '@/app/actions/user';

export function useScrapeJobs(pollWhileActive = false) {
  return useSWR('scrape-jobs', () => getScrapeJobs(), {
    refreshInterval: (latestData) => {
      if (!pollWhileActive) return 0;
      const hasActive = latestData?.some(
        (j) => j.status === 'PENDING' || j.status === 'PROCESSING'
      );
      return hasActive ? 5000 : 0;
    },
    dedupingInterval: 2000,
  });
}

export function useListings() {
  return useSWR('listings', () => getListings(), {
    dedupingInterval: 5000,
    revalidateOnFocus: false,
  });
}

export function useHasCredentials() {
  return useSWR('has-credentials', () => hasCredentialsConfigured(), {
    dedupingInterval: 30000,
    revalidateOnFocus: false,
  });
}

/** Revalidate scrape jobs cache from anywhere */
export function revalidateScrapeJobs() {
  return globalMutate('scrape-jobs');
}

/** Revalidate listings cache from anywhere */
export function revalidateListings() {
  // Invalidate all listing keys
  return globalMutate((key) => Array.isArray(key) && key[0] === 'listings');
}
