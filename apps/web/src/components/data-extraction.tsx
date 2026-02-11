'use client'

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Download, Play, RefreshCw, Home, FileText, MapPin, Calendar, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { exportListingsToExcel } from '@/lib/export';
import { startScrape } from '@/app/actions/scrape';
import type { Listing, ListingsFilter } from '@/app/actions/listings';
import { useScrapeJobs, useListings, useHasCredentials, revalidateScrapeJobs, revalidateListings } from '@/hooks/use-data';

function ListingStatusBadge({ status }: { status: Listing['status'] }) {
  const variants: Record<Listing['status'], 'default' | 'secondary' | 'destructive'> = {
    ACTIVE: 'default',
    RESERVED: 'secondary',
    CALLED_OFF: 'destructive',
  };

  const labels: Record<Listing['status'], string> = {
    ACTIVE: 'Active',
    RESERVED: 'Reserved',
    CALLED_OFF: 'Called Off',
  };

  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

function TenureBadge({ tenure }: { tenure: Listing['tenure'] }) {
  const variants: Record<Listing['tenure'], 'default' | 'secondary' | 'outline'> = {
    FREEHOLD: 'default',
    LEASEHOLD: 'secondary',
    NONE: 'outline',
  };

  return <Badge variant={variants[tenure]}>{tenure}</Badge>;
}

function formatPrice(currency: string, price: number): string {
  return `${currency} ${price.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const TIMEZONE = 'Asia/Singapore'; // GMT+8

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  });
}

function formatTime(date: Date): string {
  const d = new Date(date);
  const hours = parseInt(d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TIMEZONE }));
  const minutes = parseInt(d.toLocaleString('en-US', { minute: 'numeric', timeZone: TIMEZONE }));
  const hour12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'am' : 'pm';
  const minuteStr = minutes > 0 ? `.${minutes.toString().padStart(2, '0')}` : '';
  return `${hour12}${minuteStr}${ampm}`;
}

function formatDateTime(date: Date): string {
  return `${formatDate(date)}, ${formatTime(date)}`;
}

function formatLandArea(area: number, unit: string): string {
  return `${area.toLocaleString()} ${unit}`;
}

type SortColumn = 'address' | 'homeType' | 'price' | 'marketValue' | 'auctionDate' | 'tenure' | 'landArea' | 'registeredInvestor' | 'status';
type SortDirection = 'asc' | 'desc';

function SortableHeader({
  column,
  label,
  currentSort,
  currentDirection,
  onSort,
  className,
}: {
  column: SortColumn;
  label: string;
  currentSort: SortColumn | null;
  currentDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const isActive = currentSort === column;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex items-center gap-1 hover:text-foreground transition-colors -ml-2 px-2 py-1 rounded hover:bg-muted"
      >
        {label}
        {isActive ? (
          currentDirection === 'asc' ? (
            <ArrowUp className="w-4 h-4" />
          ) : (
            <ArrowDown className="w-4 h-4" />
          )
        ) : (
          <ArrowUpDown className="w-4 h-4 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

export function DataExtraction() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tenureFilter, setTenureFilter] = useState<string>('all');
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // SWR hooks — cached, deduplicated, auto-polling
  const { data: hasCredentials } = useHasCredentials();
  const { data: jobs, error: jobsError } = useScrapeJobs(true);

  const filters = useMemo<ListingsFilter | undefined>(() => {
    const f: ListingsFilter = {};
    if (statusFilter !== 'all') f.status = statusFilter as ListingsFilter['status'];
    if (tenureFilter !== 'all') f.tenure = tenureFilter as ListingsFilter['tenure'];
    return Object.keys(f).length > 0 ? f : undefined;
  }, [statusFilter, tenureFilter]);

  const { data: listings = [], isLoading: loading, error: listingsError } = useListings(filters);

  const activeJob = jobs?.find(j => j.status === 'PENDING' || j.status === 'PROCESSING') ?? null;

  // Track previous active job to detect completion (survives tab switches via sessionStorage)
  const prevActiveJobRef = useRef(activeJob);

  // On mount, check if a tracked job completed while this component was unmounted
  useEffect(() => {
    const storedJobId = sessionStorage.getItem('activeJobId');
    if (storedJobId && !activeJob && jobs) {
      const finishedJob = jobs.find(j => j.id === storedJobId);
      if (finishedJob?.status === 'COMPLETED') {
        toast.success(`Extraction complete — ${finishedJob.totalRecords ?? 0} listings found`);
        revalidateListings();
        sessionStorage.removeItem('activeJobId');
      } else if (finishedJob?.status === 'FAILED') {
        toast.error(finishedJob.error || 'Extraction failed');
        sessionStorage.removeItem('activeJobId');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prev = prevActiveJobRef.current;
    prevActiveJobRef.current = activeJob;

    // Persist active job ID for cross-tab-switch detection
    if (activeJob) {
      sessionStorage.setItem('activeJobId', activeJob.id);
    }

    if (prev && !activeJob && jobs) {
      const finishedJob = jobs.find(j => j.id === prev.id);
      if (finishedJob?.status === 'COMPLETED') {
        toast.success(`Extraction complete — ${finishedJob.totalRecords ?? 0} listings found`);
        revalidateListings();
      } else if (finishedJob?.status === 'FAILED') {
        toast.error(finishedJob.error || 'Extraction failed');
      }
      sessionStorage.removeItem('activeJobId');
    }
  }, [activeJob, jobs]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedListings = [...listings].sort((a, b) => {
    if (!sortColumn) return 0;
    const multiplier = sortDirection === 'asc' ? 1 : -1;

    switch (sortColumn) {
      case 'address':
      case 'homeType':
      case 'tenure':
      case 'status':
        return multiplier * a[sortColumn].localeCompare(b[sortColumn]);
      case 'price':
      case 'marketValue':
      case 'landArea':
      case 'registeredInvestor':
        return multiplier * (a[sortColumn] - b[sortColumn]);
      case 'auctionDate':
        return multiplier * (new Date(a.auctionDate).getTime() - new Date(b.auctionDate).getTime());
      default:
        return 0;
    }
  });

  const handleStartExtraction = async () => {
    setIsExtracting(true);
    try {
      await startScrape();
      await revalidateScrapeJobs();
      toast.success('Extraction started');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start extraction');
    } finally {
      setIsExtracting(false);
    }
  };

  const exportToExcel = () => {
    if (listings.length === 0) {
      toast.error('No data to export');
      return;
    }
    const { fileName, count } = exportListingsToExcel(listings);
    toast.success(`Exported ${count} listings to ${fileName}`);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (jobsError || listingsError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
          <p className="text-sm text-destructive">
            {jobsError?.message || listingsError?.message || 'Failed to load data'}
          </p>
          <Button variant="outline" size="sm" onClick={() => { revalidateScrapeJobs(); revalidateListings(); }}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Data Extraction</CardTitle>
          <CardDescription>
            Start extraction using the URL configured in Settings. View your property listings below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={handleStartExtraction} disabled={isExtracting || !!activeJob || hasCredentials !== true} className="gap-2">
              {isExtracting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Extraction
                </>
              )}
            </Button>
          </div>
          {activeJob && (activeJob.status === 'PENDING' || activeJob.status === 'PROCESSING') && (
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-md px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Extraction in progress...
            </div>
          )}
          {hasCredentials === false && (
            <p className="text-sm text-amber-600">
              Please configure your credentials and target URL in Settings before starting an extraction.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Home className="w-5 h-5 text-slate-600" />
              <CardTitle>
                Property Listings
                {listings.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    (Extracted: {formatDateTime(listings.reduce((latest, l) =>
                      new Date(l.createdAt) > new Date(latest.createdAt) ? l : latest
                    ).createdAt)})
                  </span>
                )}
              </CardTitle>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={exportToExcel} disabled={listings.length === 0} className="gap-2">
                <Download className="w-4 h-4" />
                Export to Excel
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="RESERVED">Reserved</SelectItem>
                    <SelectItem value="CALLED_OFF">Called Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tenure:</span>
                <Select value={tenureFilter} onValueChange={setTenureFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="FREEHOLD">Freehold</SelectItem>
                    <SelectItem value="LEASEHOLD">Leasehold</SelectItem>
                    <SelectItem value="NONE">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <CardDescription>
            {listings.length} {listings.length === 1 ? 'listing' : 'listings'} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listings.length === 0 ? (
            <div className="text-center py-12 border rounded-md border-dashed">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-2">No listings found</p>
              <p className="text-sm text-slate-400">Click "Start Extraction" to scrape property data</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader column="address" label="Unit Address" currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader column="homeType" label="House Type" currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader column="price" label="Reserve Price" currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader column="marketValue" label="Market Value" currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader column="auctionDate" label="Auction Date" currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader column="tenure" label="Tenure" currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader column="landArea" label="Land Area" currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader column="registeredInvestor" label="Investors" currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader column="status" label="Status" currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedListings.map((listing) => (
                    <TableRow key={listing.id}>
                      <TableCell className="font-medium max-w-xs">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                          <span className="truncate" title={listing.address}>
                            {listing.address}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{listing.homeType}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrice(listing.currency, listing.price)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatPrice(listing.currency, listing.marketValue)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          {formatDate(listing.auctionDate)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <TenureBadge tenure={listing.tenure} />
                      </TableCell>
                      <TableCell className="text-right">
                        {formatLandArea(listing.landArea, listing.landAreaUnit)}
                      </TableCell>
                      <TableCell className="text-right">
                        {listing.registeredInvestor}
                      </TableCell>
                      <TableCell>
                        <ListingStatusBadge status={listing.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
