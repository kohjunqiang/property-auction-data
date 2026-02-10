/**
 * Standalone test script for the scrape logic.
 * Tests stealth browser launch, login, pagination, and extraction — no DB.
 *
 * Usage:
 *   npx tsx apps/api/src/scrape/test-scrape.ts <url> <username> <password>
 *
 * Example:
 *   npx tsx apps/api/src/scrape/test-scrape.ts "https://bp.erp213.com/index.html#ajax/auction/list-view.html?col=CreatedDate&order=desc" myuser mypass
 */

import { type Page } from 'playwright';
import { launchStealthBrowser, humanDelay, humanType, humanClick } from './stealth-browser';

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

function parsePrice(text: string): { currency: string; amount: number } {
  const match = text.match(/^([A-Z]+)\s*([\d,]+\.?\d*)$/);
  if (!match) return { currency: 'RM', amount: 0 };
  return { currency: match[1], amount: parseFloat(match[2].replace(/,/g, '')) };
}

function parseDate(text: string): string {
  const [day, month, year] = text.split('/').map(Number);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function mapStatus(text: string): string {
  const n = text.toLowerCase().trim();
  if (n === 'reserved') return 'RESERVED';
  if (n === 'called off') return 'CALLED_OFF';
  return 'ACTIVE';
}

function mapTenure(text: string): string {
  const n = text.toLowerCase().trim();
  if (n === 'freehold') return 'FREEHOLD';
  if (n === 'leasehold') return 'LEASEHOLD';
  return 'NONE';
}

async function extractListingsFromPage(page: Page): Promise<RawListing[]> {
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

async function main() {
  const [, , url, username, password] = process.argv;

  if (!url || !username || !password) {
    console.error('Usage: npx tsx apps/api/src/scrape/test-scrape.ts <url> <username> <password>');
    process.exit(1);
  }

  console.log('Launching stealth browser...');
  const { browser, context, page } = await launchStealthBrowser();

  try {
    // --- Navigate ---
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });
    await humanDelay(500, 1500);

    // --- Login if needed ---
    if (page.url().includes('login.html')) {
      console.log('Login required, filling credentials...');
      await humanType(page, '#txtUsername', username);
      await humanDelay(300, 700);
      await humanType(page, '#txtPassword', password);
      await humanDelay(500, 1000);
      await humanClick(page, '#login-form button[type="submit"]');

      try {
        await page.waitForURL('**/index.html**', { timeout: 15000 });
      } catch {
        console.error('Login failed - credentials rejected or timeout');
        process.exit(1);
      }

      const cookies = await context.cookies();
      const tokenCookie = cookies.find((c) => c.name === 'token');
      if (!tokenCookie?.value) {
        console.error('Login failed - no auth token cookie');
        process.exit(1);
      }

      console.log('Login successful');
    } else {
      console.log('Already authenticated');
    }

    // Wait for AJAX content to fully render (footer exists in template but is empty until data loads)
    console.log(`Current URL: ${page.url()}`);
    console.log('Waiting for listing content to load...');
    await page.waitForFunction(
      `(() => {
        const el = document.querySelector('.widget-footer');
        return el && /\\d+\\s*record/i.test(el.textContent || '');
      })()`,
      undefined,
      { timeout: 15000 },
    );

    // --- Total records ---
    const totalRecordsText = await page.$eval('.widget-footer', (el: any) => el.textContent?.trim() || '');
    const totalRecordsMatch = totalRecordsText.match(/(\d+)\s*record/i);
    const totalRecords = totalRecordsMatch ? parseInt(totalRecordsMatch[1], 10) : 0;
    console.log(`Total records: ${totalRecords}`);

    // --- Extract across pages ---
    const allListings: RawListing[] = [];
    let currentPage = 1;

    while (true) {
      console.log(`Scraping page ${currentPage}...`);
      const pageListings = await extractListingsFromPage(page);
      allListings.push(...pageListings);
      console.log(`  Extracted ${pageListings.length} listings`);

      if (totalRecords > 0 && allListings.length >= totalRecords) break;

      const nextLink = await page.$('.pagination a:has-text("Next")');
      if (!nextLink) break;

      // Remember first address on current page to detect when content changes
      const firstAddress = await page.$eval(
        'article .col-xs-12.col-sm-6.col-md-4 td.three_row',
        (el: any) => el.textContent?.trim() || '',
      );

      currentPage++;
      await humanDelay(1000, 3000);
      await nextLink.click();

      // Wait for page content to actually change (new listings loaded via AJAX)
      await page.waitForFunction(
        `(() => {
          const el = document.querySelector('article .col-xs-12.col-sm-6.col-md-4 td.three_row');
          return el && el.textContent?.trim() !== ${JSON.stringify(firstAddress)};
        })()`,
        undefined,
        { timeout: 15000 },
      );
    }

    console.log(`\nTotal extracted: ${allListings.length} listings`);

    // --- Verify count ---
    const countMismatch = totalRecords > 0 && allListings.length !== totalRecords;
    if (countMismatch) {
      console.warn(`WARNING: Expected ${totalRecords} but got ${allListings.length}`);
    } else {
      console.log('Count verification passed');
    }

    // --- Show parsed results ---
    console.log('\n--- First 3 parsed listings ---');
    allListings.slice(0, 3).forEach((raw, i) => {
      const { currency, amount: price } = parsePrice(raw.priceText);
      const { amount: marketValue } = parsePrice(raw.marketValueText);
      console.log(`\nListing ${i + 1}:`);
      console.log(`  Address:    ${raw.address}`);
      console.log(`  Type:       ${raw.homeType}`);
      console.log(`  Status:     ${mapStatus(raw.status)}`);
      console.log(`  Price:      ${currency} ${price}`);
      console.log(`  Market Val: ${currency} ${marketValue}`);
      console.log(`  Auction:    ${parseDate(raw.auctionDate)}`);
      console.log(`  Tenure:     ${mapTenure(raw.tenure)}`);
      console.log(`  Land Area:  ${raw.landArea} sqft`);
      console.log(`  Investors:  ${raw.registeredInvestor}`);
      console.log(`  Created:    ${parseDate(raw.createdDate)}`);
    });

    console.log(`\n--- Last 3 parsed listings ---`);
    allListings.slice(-3).forEach((raw, i) => {
      const { currency, amount: price } = parsePrice(raw.priceText);
      const { amount: marketValue } = parsePrice(raw.marketValueText);
      console.log(`\nListing ${allListings.length - 2 + i}:`);
      console.log(`  Address:    ${raw.address}`);
      console.log(`  Type:       ${raw.homeType}`);
      console.log(`  Status:     ${mapStatus(raw.status)}`);
      console.log(`  Price:      ${currency} ${price}`);
      console.log(`  Market Val: ${currency} ${marketValue}`);
      console.log(`  Auction:    ${parseDate(raw.auctionDate)}`);
      console.log(`  Tenure:     ${mapTenure(raw.tenure)}`);
      console.log(`  Land Area:  ${raw.landArea} sqft`);
      console.log(`  Investors:  ${raw.registeredInvestor}`);
      console.log(`  Created:    ${parseDate(raw.createdDate)}`);
    });

    // --- Only close browser if everything passed ---
    if (countMismatch) {
      console.log('\nBrowser left open for inspection due to count mismatch.');
      console.log('Press Ctrl+C to exit and close browser.');
      await new Promise(() => {});
    } else {
      await browser.close();
      console.log('\nBrowser closed.');
    }
  } catch (err) {
    console.error('\nError occurred (browser left open for inspection):', err);
    console.log('Press Ctrl+C to exit and close browser.');
    // Keep process alive so browser stays open
    await new Promise(() => {});
  }
}

main();
