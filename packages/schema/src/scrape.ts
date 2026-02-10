import { z } from 'zod';

// Response schema for scrape jobs
export const ScrapeJobResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  url: z.string(),
  createdAt: z.string().or(z.date()),
  itemsFound: z.number().optional()
});

export type ScrapeJobResponseType = z.infer<typeof ScrapeJobResponseSchema>;
