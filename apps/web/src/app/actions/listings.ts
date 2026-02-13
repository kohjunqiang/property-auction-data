'use server';

import { db } from '@repo/database';
import { getSessionUser } from './_auth';

export type RemarkType = 'NEW' | 'PRICE_INCREASED' | 'PRICE_DECREASED' | null;

export interface PriceHistoryEntry {
  price: number;
  date: Date;
}

export interface Listing {
  id: string;
  address: string;
  homeType: string;
  currency: string;
  price: number;
  marketValue: number;
  auctionDate: Date;
  tenure: 'NONE' | 'FREEHOLD' | 'LEASEHOLD';
  landArea: number;
  landAreaUnit: string;
  registeredInvestor: number;
  entryCreated: Date;
  status: 'ACTIVE' | 'RESERVED' | 'CALLED_OFF';
  scrapeJobId: string;
  createdAt: Date;
  updatedAt: Date;
  remark: RemarkType;
  priceHistory: PriceHistoryEntry[];
}

export interface ListingsFilter {
  status?: 'ACTIVE' | 'RESERVED' | 'CALLED_OFF';
  tenure?: 'NONE' | 'FREEHOLD' | 'LEASEHOLD';
  scrapeJobId?: string;
}

export interface JobRemarkCounts {
  new: number;
  priceIncreased: number;
  priceDecreased: number;
}

export async function getJobRemarkCounts(): Promise<Record<string, JobRemarkCounts>> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const completedJobs = await db
    .selectFrom('scrape_jobs')
    .where('scrape_jobs.user_id', '=', user.id)
    .where('scrape_jobs.status', '=', 'COMPLETED')
    .orderBy('scrape_jobs.created_at', 'desc')
    .select(['scrape_jobs.id', 'scrape_jobs.created_at'])
    .execute();

  if (completedJobs.length === 0) {
    return {};
  }

  const jobIds = completedJobs.map(j => j.id);

  // Fetch address + price for all listings in completed jobs
  const allListings = await db
    .selectFrom('listings')
    .where('listings.scrape_job_id', 'in', jobIds)
    .select(['listings.scrape_job_id', 'listings.address', 'listings.price'])
    .execute();

  // Group by job: jobId -> Map<address, price>
  const jobListingsMap = new Map<string, Map<string, number>>();
  for (const row of allListings) {
    let addrMap = jobListingsMap.get(row.scrape_job_id);
    if (!addrMap) {
      addrMap = new Map();
      jobListingsMap.set(row.scrape_job_id, addrMap);
    }
    addrMap.set(row.address, Number(row.price));
  }

  // Compare each job against its predecessor (jobs are ordered newest first)
  const result: Record<string, JobRemarkCounts> = {};
  for (let i = 0; i < completedJobs.length; i++) {
    const currentJobId = completedJobs[i].id;
    const currentMap = jobListingsMap.get(currentJobId);

    if (!currentMap) {
      result[currentJobId] = { new: 0, priceIncreased: 0, priceDecreased: 0 };
      continue;
    }

    if (i === completedJobs.length - 1) {
      // Oldest job — no previous to compare, all are "new"
      result[currentJobId] = { new: currentMap.size, priceIncreased: 0, priceDecreased: 0 };
      continue;
    }

    const previousJobId = completedJobs[i + 1].id;
    const previousMap = jobListingsMap.get(previousJobId) ?? new Map<string, number>();

    let newCount = 0;
    let priceIncreasedCount = 0;
    let priceDecreasedCount = 0;

    for (const [address, price] of currentMap) {
      const prevPrice = previousMap.get(address);
      if (prevPrice === undefined) {
        newCount++;
      } else if (price > prevPrice) {
        priceIncreasedCount++;
      } else if (price < prevPrice) {
        priceDecreasedCount++;
      }
    }

    result[currentJobId] = {
      new: newCount,
      priceIncreased: priceIncreasedCount,
      priceDecreased: priceDecreasedCount,
    };
  }

  return result;
}

export async function getListings(filters?: ListingsFilter): Promise<Listing[]> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // 1. Get completed job IDs ordered by most recent first
  const completedJobs = await db
    .selectFrom('scrape_jobs')
    .where('scrape_jobs.user_id', '=', user.id)
    .where('scrape_jobs.status', '=', 'COMPLETED')
    .orderBy('scrape_jobs.created_at', 'desc')
    .select(['scrape_jobs.id', 'scrape_jobs.created_at'])
    .execute();

  if (completedJobs.length === 0) {
    return [];
  }

  // Determine which job to show and which to compare against
  let targetJobId: string;
  let previousJobId: string | null = null;

  if (filters?.scrapeJobId) {
    targetJobId = filters.scrapeJobId;
    // Find the job immediately before the selected one
    const targetIndex = completedJobs.findIndex(j => j.id === targetJobId);
    if (targetIndex >= 0 && targetIndex < completedJobs.length - 1) {
      previousJobId = completedJobs[targetIndex + 1].id;
    }
  } else {
    targetJobId = completedJobs[0].id;
    previousJobId = completedJobs.length > 1 ? completedJobs[1].id : null;
  }

  // 2. Get current listings from target job
  let query = db
    .selectFrom('listings')
    .where('listings.scrape_job_id', '=', targetJobId)
    .selectAll('listings')
    .orderBy('listings.auction_date', 'asc');

  if (filters?.status) {
    query = query.where('listings.status', '=', filters.status);
  }
  if (filters?.tenure) {
    query = query.where('listings.tenure', '=', filters.tenure);
  }

  const currentListings = await query.limit(5000).execute();

  if (currentListings.length === 0) {
    return [];
  }

  const addresses = currentListings.map(l => l.address);

  // 3. Get previous listings for comparison (address + price only)
  let previousMap = new Map<string, number>();
  if (previousJobId) {
    const previousListings = await db
      .selectFrom('listings')
      .where('listings.scrape_job_id', '=', previousJobId)
      .where('listings.address', 'in', addresses)
      .select(['listings.address', 'listings.price'])
      .execute();

    previousMap = new Map(
      previousListings.map(p => [p.address, Number(p.price)])
    );
  }

  // 4. Get price history across all completed jobs
  const completedJobIds = completedJobs.map(j => j.id);
  const historyRows = await db
    .selectFrom('listings')
    .innerJoin('scrape_jobs', 'listings.scrape_job_id', 'scrape_jobs.id')
    .where('listings.scrape_job_id', 'in', completedJobIds)
    .where('listings.address', 'in', addresses)
    .select([
      'listings.address',
      'listings.price',
      'scrape_jobs.created_at',
    ])
    .orderBy('scrape_jobs.created_at', 'desc')
    .execute();

  const historyMap = new Map<string, PriceHistoryEntry[]>();
  for (const row of historyRows) {
    const entries = historyMap.get(row.address) || [];
    entries.push({
      price: Number(row.price),
      date: row.created_at ? new Date(row.created_at) : new Date(),
    });
    historyMap.set(row.address, entries);
  }

  // 5. Transform and enrich listings
  return currentListings.map(listing => {
    const currentPrice = Number(listing.price) || 0;
    let remark: RemarkType = null;

    if (previousJobId) {
      const prevPrice = previousMap.get(listing.address);
      if (prevPrice === undefined) {
        remark = 'NEW';
      } else if (currentPrice > prevPrice) {
        remark = 'PRICE_INCREASED';
      } else if (currentPrice < prevPrice) {
        remark = 'PRICE_DECREASED';
      }
    }

    return {
      id: listing.id,
      address: listing.address,
      homeType: listing.home_type,
      currency: listing.currency,
      price: currentPrice,
      marketValue: Number(listing.market_value) || 0,
      auctionDate: listing.auction_date ? new Date(listing.auction_date) : new Date(0),
      tenure: listing.tenure as Listing['tenure'],
      landArea: Number(listing.land_area) || 0,
      landAreaUnit: listing.land_area_unit,
      registeredInvestor: listing.registered_investor,
      entryCreated: listing.entry_created ? new Date(listing.entry_created) : new Date(0),
      status: listing.status as Listing['status'],
      scrapeJobId: listing.scrape_job_id,
      createdAt: listing.created_at ? new Date(listing.created_at) : new Date(),
      updatedAt: listing.updated_at ? new Date(listing.updated_at) : new Date(),
      remark,
      priceHistory: historyMap.get(listing.address) || [],
    };
  });
}
