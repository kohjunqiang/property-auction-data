import * as XLSX from 'xlsx';
import type { Listing } from '@/app/actions/listings';

const TIMEZONE = 'Asia/Singapore';

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  });
}

export function exportListingsToExcel(listings: Listing[], fileNameSuffix?: string) {
  const worksheet = XLSX.utils.json_to_sheet(
    listings.map((listing) => ({
      'Unit Address': listing.address,
      'House Type': listing.homeType,
      'Currency': listing.currency,
      'Reserve Price': listing.price,
      'Market Value': listing.marketValue,
      'Auction Date': formatDate(listing.auctionDate),
      'Tenure': listing.tenure,
      'Land Area': listing.landArea,
      'Land Area Unit': listing.landAreaUnit,
      'Registered Investors': listing.registeredInvestor,
      'Entry Created': formatDate(listing.entryCreated),
      'Status': listing.status,
    }))
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Listings');
  const suffix = fileNameSuffix ?? new Date().toISOString().split('T')[0];
  const fileName = `property_listings_${suffix}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  return { fileName, count: listings.length };
}
