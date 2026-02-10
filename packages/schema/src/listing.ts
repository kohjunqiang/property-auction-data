import { z } from 'zod';

// Enum schemas matching database enums
export const ListingStatusEnum = z.enum(['ACTIVE', 'RESERVED', 'CALLED_OFF']);
export const TenureEnum = z.enum(['NONE', 'FREEHOLD', 'LEASEHOLD']);

// Schema for creating a listing (used by scraper)
export const CreateListingSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  homeType: z.string().min(1, 'Home type is required'),
  currency: z.string().default('RM'),
  price: z.number().positive('Price must be positive'),
  marketValue: z.number().positive('Market value must be positive'),
  auctionDate: z.coerce.date(),
  tenure: TenureEnum,
  landArea: z.number().positive('Land area must be positive'),
  landAreaUnit: z.string().default('sqft'),
  registeredInvestor: z.number().int().min(0).default(0),
  entryCreated: z.coerce.date(),
  status: ListingStatusEnum,
  scrapeJobId: z.string().cuid('Invalid scrape job ID'),
});

// Schema for API responses (includes generated fields)
export const ListingSchema = CreateListingSchema.extend({
  id: z.string().cuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Schema for filtering/querying listings
export const ListingFilterSchema = z.object({
  status: ListingStatusEnum.optional(),
  tenure: TenureEnum.optional(),
  homeType: z.string().optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  auctionDateFrom: z.coerce.date().optional(),
  auctionDateTo: z.coerce.date().optional(),
  scrapeJobId: z.string().cuid().optional(),
});

// Export inferred TypeScript types
export type CreateListingType = z.infer<typeof CreateListingSchema>;
export type ListingType = z.infer<typeof ListingSchema>;
export type ListingFilterType = z.infer<typeof ListingFilterSchema>;
export type ListingStatusType = z.infer<typeof ListingStatusEnum>;
export type TenureType = z.infer<typeof TenureEnum>;
