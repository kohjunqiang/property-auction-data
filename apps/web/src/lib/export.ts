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
  // Add Google Maps hyperlinks to Unit Address cells (column A)
  const range = XLSX.utils.decode_range(worksheet['!ref']!);
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
    const cell = worksheet[cellRef];
    if (cell && cell.v) {
      cell.l = {
        Target: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(cell.v))}`,
        Tooltip: 'Open in Google Maps',
      };
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Listings');
  const suffix = fileNameSuffix ?? new Date().toISOString().split('T')[0];
  const fileName = `property_listings_${suffix}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  return { fileName, count: listings.length };
}
