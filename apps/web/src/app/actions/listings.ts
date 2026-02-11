'use server';

import { db } from '@repo/database';
import { getSessionUser } from './_auth';

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
}

export interface ListingsFilter {
  status?: 'ACTIVE' | 'RESERVED' | 'CALLED_OFF';
  tenure?: 'NONE' | 'FREEHOLD' | 'LEASEHOLD';
  scrapeJobId?: string;
}

export async function getListings(filters?: ListingsFilter): Promise<Listing[]> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Build query - join listings with scrape_jobs to filter by user
  let query = db
    .selectFrom('listings')
    .innerJoin('scrape_jobs', 'listings.scrape_job_id', 'scrape_jobs.id')
    .where('scrape_jobs.user_id', '=', user.id)
    .selectAll('listings')
    .orderBy('listings.auction_date', 'asc');

  // Apply filters
  if (filters?.status) {
    query = query.where('listings.status', '=', filters.status);
  }
  if (filters?.tenure) {
    query = query.where('listings.tenure', '=', filters.tenure);
  }
  if (filters?.scrapeJobId) {
    query = query.where('listings.scrape_job_id', '=', filters.scrapeJobId);
  } else {
    // Default to latest completed scrape job (single subquery instead of 2 queries)
    query = query.where('listings.scrape_job_id', 'in',
      db.selectFrom('scrape_jobs')
        .where('scrape_jobs.user_id', '=', user.id)
        .where('scrape_jobs.status', '=', 'COMPLETED')
        .orderBy('scrape_jobs.created_at', 'desc')
        .select('scrape_jobs.id')
        .limit(1)
    );
  }

  const listings = await query.limit(5000).execute();

  // Transform snake_case to camelCase
  return listings.map(listing => ({
    id: listing.id,
    address: listing.address,
    homeType: listing.home_type,
    currency: listing.currency,
    price: Number(listing.price) || 0,
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
  }));
}
