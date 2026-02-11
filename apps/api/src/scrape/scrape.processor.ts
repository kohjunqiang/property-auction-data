import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { type Page, type Browser } from 'playwright';
import { QueueService } from '../queue/queue.service';
import { Kysely } from 'kysely';
import { DB, createId } from '@repo/database';
import { decryptCredentials, isEncryptedFormat, type EncryptedData } from '@repo/crypto';
import { launchStealthBrowser, humanDelay, humanType, humanClick } from './stealth-browser';

interface ScrapeJobData {
  jobId: string;
  userId: string;
  url: string;
}

interface UserCreds {
  username: string;
  password: string;
}

interface RawListing {
  status: string;
  address: string;
  homeType: string;
  priceText: string;
  marketValueText: string;
  auctionDate: string;
  tenure: string;
  landArea: string;
  registeredInvestor: string;
  createdDate: string;
}

const STUCK_JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const STUCK_JOB_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60s
const JOB_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes

@Injectable()
export class ScrapeProcessor implements OnModuleInit, OnModuleDestroy {
  private stuckJobInterval: NodeJS.Timeout | null = null;
  private activeBrowser: Browser | null = null;

  constructor(
    private readonly queueService: QueueService,
    @Inject('DATABASE') private db: Kysely<DB>,
  ) {}

  private async updateCredsStatus(userId: string, status: 'working' | 'failed') {
    try {
      await this.db
        .updateTable('users')
        .set({
          creds_status: status,
          creds_status_updated_at: new Date(),
          updated_at: new Date(),
        } as any)
        .where('id', '=', userId)
        .execute();
      console.log(`Updated credentials status to '${status}' for user ${userId}`);
    } catch (error) {
      console.error(`Failed to update creds_status for user ${userId}:`, error);
    }
  }

  private parsePrice(text: string): { currency: string; amount: number } {
    const match = text.match(/^([A-Z]+)\s*([\d,]+\.?\d*)$/);
    if (!match) return { currency: 'RM', amount: 0 };
    const amount = parseFloat(match[2].replace(/,/g, ''));
    return {
      currency: match[1],
      amount: isNaN(amount) ? 0 : amount,
    };
  }

  private parseDate(text: string): Date {
    if (!text) return new Date();
    const [day, month, year] = text.split('/').map(Number);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return new Date();
    return new Date(year, month - 1, day);
  }

  private mapStatus(text: string): 'ACTIVE' | 'RESERVED' | 'CALLED_OFF' {
    const normalized = text.toLowerCase().trim();
    if (normalized === 'reserved') return 'RESERVED';
    if (normalized === 'called off') return 'CALLED_OFF';
    return 'ACTIVE';
  }

  private mapTenure(text: string): 'NONE' | 'FREEHOLD' | 'LEASEHOLD' {
    const normalized = text.toLowerCase().trim();
    if (normalized === 'freehold') return 'FREEHOLD';
    if (normalized === 'leasehold') return 'LEASEHOLD';
    return 'NONE';
  }

  private async extractListingsFromPage(page: Page): Promise<RawListing[]> {
    return page.$$eval('article .col-xs-12.col-sm-6.col-md-4', (cards: any[]) => {
      return cards.map((card: any) => {
        const labels: any[] = Array.from(card.querySelectorAll('label'));
        const labelTexts = labels.map((l: any) => l.textContent?.trim() || '');

        const auctionDateLabel = labelTexts.find((t: string) => t.includes('Auction Date'));
        const tenureLabel = labelTexts.find((t: string) => t.includes('Tenure'));
        const landAreaLabel = labelTexts.find((t: string) => t.includes('Land Area'));
        const createdDateLabel = labelTexts.find((t: string) => t.includes('Created Date'));

        const marketValueMatch = card.innerHTML.match(/\(Market Value:\s*(RM\s*[\d,]+\.?\d*)\)/i);

        return {
          status: card.querySelector('.lblStatus')?.textContent?.trim() || '',
          address: card.querySelector('td.three_row')?.textContent?.trim() || '',
          homeType: card.querySelector('td.grey-font')?.textContent?.trim() || '',
          priceText: card.querySelector('.market-price')?.textContent?.trim() || '',
          marketValueText: marketValueMatch ? marketValueMatch[1].trim() : '',
          auctionDate: auctionDateLabel?.replace('Auction Date:', '').trim() || '',
          tenure: tenureLabel?.replace('Tenure:', '').trim() || '',
          landArea: landAreaLabel?.replace('Land Area:', '').trim() || '',
          registeredInvestor: card.querySelector('.lblTotalRegisteredCustomer')?.textContent?.trim() || '0',
          createdDate: createdDateLabel?.replace('Created Date:', '').trim() || '',
        };
      });
    });
  }

  private async sweepStuckJobs() {
    try {
      const cutoff = new Date(Date.now() - STUCK_JOB_TIMEOUT_MS);
      const result = await this.db
        .updateTable('scrape_jobs')
        .set({
          status: 'FAILED',
          error: 'Job timed out (stuck in PROCESSING)',
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where('status', '=', 'PROCESSING')
        .where('started_at', '<', cutoff)
        .execute();

      const count = Number(result[0]?.numUpdatedRows ?? 0);
      if (count > 0) {
        console.log(`Swept ${count} stuck PROCESSING jobs`);
      }
    } catch (error) {
      console.error('Error sweeping stuck jobs:', error);
    }
  }

  async onModuleDestroy() {
    if (this.stuckJobInterval) {
      clearInterval(this.stuckJobInterval);
    }
  }

  async onModuleInit() {
    // Sweep stuck jobs on startup and periodically
    await this.sweepStuckJobs();
    this.stuckJobInterval = setInterval(
      () => this.sweepStuckJobs(),
      STUCK_JOB_CHECK_INTERVAL_MS,
    );

    // Subscribe to scrape queue
    await this.queueService.subscribe(process.env.SCRAPE_QUEUE_NAME!, async (job) => {
      const data = job.data as ScrapeJobData;

      // Idempotency guard: skip if already processing or completed
      const existingJob = await this.db
        .selectFrom('scrape_jobs')
        .select('status')
        .where('id', '=', data.jobId)
        .executeTakeFirst();

      if (existingJob?.status === 'PROCESSING' || existingJob?.status === 'COMPLETED') {
        console.log(`Job ${data.jobId} already ${existingJob.status}, skipping`);
        return;
      }

      console.log(`Processing job ${data.jobId}...`);

      try {
        await this.processJob(data);
      } catch (error) {
        console.error(`Job ${data.jobId} failed:`, error);
        try {
          await this.db
            .updateTable('scrape_jobs')
            .set({
              status: 'FAILED',
              error: error instanceof Error ? error.message : 'Unknown error',
              completed_at: new Date(),
              updated_at: new Date(),
            })
            .where('id', '=', data.jobId)
            .execute();
        } catch (dbError) {
          console.error(`Job ${data.jobId} - Failed to update job status to FAILED:`, dbError);
        }
      }
    });
  }

  private async processJob(data: ScrapeJobData) {
    // Update job status to PROCESSING
    await this.db
      .updateTable('scrape_jobs')
      .set({
        status: 'PROCESSING',
        started_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', data.jobId)
      .execute();

    // Fetch user credentials
    const user = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', data.userId)
      .executeTakeFirst();

    if (!user) {
      throw new Error(`User ${data.userId} not found`);
    }

    let creds: UserCreds | null = null;
    const userRecord = user as typeof user & { creds_encrypted?: boolean };

    if (user.creds) {
      // Check if credentials are encrypted (creds_encrypted column may not exist yet)
      if (userRecord.creds_encrypted && isEncryptedFormat(user.creds)) {
        try {
          creds = decryptCredentials(user.creds as unknown as EncryptedData);
        } catch (error) {
          throw new Error(`Failed to decrypt credentials for user ${data.userId}`);
        }
      } else {
        // Legacy plain JSON credentials
        creds = user.creds as unknown as UserCreds;
      }
    }

    if (!creds?.username || !creds?.password) {
      throw new Error(`User ${data.userId} has no credentials configured`);
    }

    console.log(`Job ${data.jobId} - Using credentials for user: ${user.id}`);

    // Launch stealth browser
    const { browser, context, page } = await launchStealthBrowser();
    this.activeBrowser = browser;

    // Set a timeout that force-closes the browser to abort all pending operations
    const jobTimeout = setTimeout(async () => {
      console.error(`Job ${data.jobId} - Force closing browser due to timeout (${JOB_TIMEOUT_MS / 1000}s)`);
      try { await browser.close(); } catch { /* already closed */ }
    }, JOB_TIMEOUT_MS);

    try {
      // --- Navigate to target URL first ---
      console.log(`Navigating to scrape URL: ${data.url}`);
      await page.goto(data.url, { waitUntil: 'networkidle' });
      await humanDelay(500, 1500);

      // --- Login only if needed (site redirects to login.html when unauthenticated) ---
      if (page.url().includes('login.html')) {
        console.log(`Login required for job ${data.jobId}`);

        // Fill login form with human-like typing
        await humanType(page, '#txtUsername', creds.username);
        await humanDelay(300, 700);
        await humanType(page, '#txtPassword', creds.password);
        await humanDelay(500, 1000);
        await humanClick(page, '#login-form button[type="submit"]');

        // Login is AJAX-based: JS intercepts form, POSTs to user-account/login,
        // stores token in cookies, then redirects to index.html#ajax/...
        // Wait for URL to change away from login.html (up to 15s)
        try {
          await page.waitForURL('**/index.html**', { timeout: 15000 });
        } catch {
          await this.updateCredsStatus(data.userId, 'failed');
          throw new Error('Login failed - credentials rejected or login timed out');
        }

        // Verify token cookie was set ($.storage uses cookies on web)
        const cookies = await context.cookies();
        const tokenCookie = cookies.find((c) => c.name === 'token');

        if (!tokenCookie?.value) {
          await this.updateCredsStatus(data.userId, 'failed');
          throw new Error('Login failed - no auth token cookie found after redirect');
        }

        console.log(`Login successful for job ${data.jobId}`);
        await this.updateCredsStatus(data.userId, 'working');

        // After login, the site's JS redirects to the listing page automatically.
        // No need to re-navigate — doing so can land on the dashboard instead.
      } else {
        console.log(`Already authenticated for job ${data.jobId}`);
      }

      // Wait for AJAX content to fully render (footer exists in template but is empty until data loads)
      await page.waitForFunction(
        `(() => {
          const el = document.querySelector('.widget-footer');
          return el && /\\d+\\s*record/i.test(el.textContent || '');
        })()`,
        undefined,
        { timeout: 15000 },
      );

      // --- Extract total records ---
      const totalRecordsText = await page.$eval('.widget-footer', (el: any) => el.textContent?.trim() || '');
      const totalRecordsMatch = totalRecordsText.match(/(\d+)\s*record/i);
      const totalRecords = totalRecordsMatch ? parseInt(totalRecordsMatch[1], 10) : 0;
      console.log(`Job ${data.jobId} - Total records: ${totalRecords}`);

      await this.db
        .updateTable('scrape_jobs')
        .set({ total_records: totalRecords, updated_at: new Date() })
        .where('id', '=', data.jobId)
        .execute();

      // --- Extract listings across all pages ---
      const allListings: RawListing[] = [];
      let currentPage = 1;

      while (true) {
        console.log(`Job ${data.jobId} - Scraping page ${currentPage}...`);
        const pageListings = await this.extractListingsFromPage(page);
        allListings.push(...pageListings);
        console.log(`Job ${data.jobId} - Extracted ${pageListings.length} listings from page ${currentPage}`);

        if (totalRecords > 0 && allListings.length >= totalRecords) break;

        // Check for "Next" pagination link
        const nextLink = await page.$('.pagination a:has-text("Next")');
        if (!nextLink) break;

        // Remember first address to detect when content changes
        const firstAddress = await page.$eval(
          'article .col-xs-12.col-sm-6.col-md-4 td.three_row',
          (el: any) => el.textContent?.trim() || '',
        );

        currentPage++;
        await humanDelay(1000, 3000);
        await nextLink.click();

        // Wait for page content to actually change (new listings loaded via AJAX)
        const escapedAddr = JSON.stringify(firstAddress);
        await page.waitForFunction(
          `(() => {
            const el = document.querySelector('article .col-xs-12.col-sm-6.col-md-4 td.three_row');
            return el && el.textContent?.trim() !== ${escapedAddr};
          })()`,
          undefined,
          { timeout: 15000 },
        );
      }

      console.log(`Job ${data.jobId} - Total extracted: ${allListings.length} listings`);

      // --- Verify scraped count matches total records (warn but proceed) ---
      if (totalRecords > 0 && allListings.length !== totalRecords) {
        console.warn(
          `Job ${data.jobId} - Mismatch: expected ${totalRecords} records but scraped ${allListings.length}. Proceeding with available data.`,
        );
        await this.db
          .updateTable('scrape_jobs')
          .set({ total_records: allListings.length, updated_at: new Date() })
          .where('id', '=', data.jobId)
          .execute();
      }

      // --- Insert listings into database ---
      const listingsToInsert = allListings.map((raw) => {
        const { currency, amount: price } = this.parsePrice(raw.priceText);
        const { amount: marketValue } = this.parsePrice(raw.marketValueText);

        return {
          id: createId(),
          address: raw.address,
          home_type: raw.homeType,
          currency,
          price: price.toString(),
          market_value: marketValue.toString(),
          auction_date: this.parseDate(raw.auctionDate),
          tenure: this.mapTenure(raw.tenure),
          land_area: ((raw.landArea || '0').match(/[\d,]+\.?\d*/)?.[0] || '0').replace(/,/g, ''),
          land_area_unit: 'sqft',
          registered_investor: parseInt((raw.registeredInvestor || '0').replace(/,/g, ''), 10) || 0,
          entry_created: this.parseDate(raw.createdDate),
          status: this.mapStatus(raw.status),
          scrape_job_id: data.jobId,
        };
      });

      let insertedCount = 0;
      let failedCount = 0;
      if (listingsToInsert.length > 0) {
        for (const listing of listingsToInsert) {
          try {
            await this.db
              .insertInto('listings')
              .values(listing)
              .onConflict((oc) =>
                oc.columns(['scrape_job_id', 'address']).doUpdateSet({
                  home_type: listing.home_type,
                  currency: listing.currency,
                  price: listing.price,
                  market_value: listing.market_value,
                  auction_date: listing.auction_date,
                  tenure: listing.tenure,
                  land_area: listing.land_area,
                  registered_investor: listing.registered_investor,
                  entry_created: listing.entry_created,
                  status: listing.status,
                  updated_at: new Date(),
                }),
              )
              .execute();
            insertedCount++;
          } catch (error) {
            failedCount++;
            console.error(`Job ${data.jobId} - Failed to insert listing at ${listing.address}:`, error);
          }
        }
        console.log(`Job ${data.jobId} - Inserted ${insertedCount}, failed ${failedCount} of ${listingsToInsert.length} listings`);
      }

      // Determine final status based on insertion results
      const totalAttempted = listingsToInsert.length;
      const allFailed = totalAttempted > 0 && insertedCount === 0;

      await this.db
        .updateTable('scrape_jobs')
        .set({
          status: allFailed ? 'FAILED' : 'COMPLETED',
          error: allFailed
            ? `All ${failedCount} listing inserts failed`
            : failedCount > 0
              ? `${failedCount} of ${totalAttempted} listings failed to insert`
              : null,
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', data.jobId)
        .execute();

      console.log(
        `Job ${data.jobId} ${allFailed ? 'failed' : 'completed'} - inserted ${insertedCount}, failed ${failedCount}`,
      );
    } finally {
      clearTimeout(jobTimeout);
      this.activeBrowser = null;
      try {
        await browser.close();
      } catch (closeError) {
        console.error(`Job ${data.jobId} - Failed to close browser:`, closeError);
      }
    }
  }
}
