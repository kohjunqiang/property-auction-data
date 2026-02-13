'use client';

import { useState } from 'react';
import { Download, Clock, CheckCircle, AlertCircle, Loader2, FileText, History, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { exportListingsToExcel } from '@/lib/export';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ScrapeJob } from '@/app/actions/scrape';
import { getListings } from '@/app/actions/listings';
import { useScrapeJobs, useJobRemarkCounts } from '@/hooks/use-data';

const statusConfig = {
  PENDING: {
    icon: Clock,
    label: 'Pending',
    className: 'text-yellow-600 bg-yellow-50',
  },
  PROCESSING: {
    icon: Loader2,
    label: 'Processing',
    className: 'text-blue-600 bg-blue-50',
  },
  COMPLETED: {
    icon: CheckCircle,
    label: 'Completed',
    className: 'text-green-600 bg-green-50',
  },
  FAILED: {
    icon: AlertCircle,
    label: 'Failed',
    className: 'text-red-600 bg-red-50',
  },
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Singapore',
  });
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  });
}

export function ActivityTable() {
  const { data: jobs = [], isLoading: loading, error } = useScrapeJobs(true);
  const { data: remarkCounts } = useJobRemarkCounts();
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);

  const handleDownload = async (job: ScrapeJob) => {
    setDownloadingJobId(job.id);
    try {
      const listings = await getListings({ scrapeJobId: job.id });
      if (listings.length === 0) {
        toast.error('No listings found for this job');
        return;
      }
      const dateStr = new Date(job.createdAt).toISOString().split('T')[0];
      const { fileName, count } = exportListingsToExcel(listings, dateStr);
      toast.success(`Exported ${count} listings to ${fileName}`);
    } catch (err) {
      toast.error('Failed to download listings');
      console.error('Download failed:', err);
    } finally {
      setDownloadingJobId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-600" />
          <CardTitle>Extraction History</CardTitle>
        </div>
        <CardDescription>Your latest scrape jobs and their status</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive text-center py-8">
            Failed to load scrape history. Please try refreshing.
          </p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No scrape jobs yet. Start an extraction from the Data Extraction tab.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total Listings</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const status = statusConfig[job.status as keyof typeof statusConfig] ?? {
                    icon: AlertCircle,
                    label: job.status,
                    className: 'text-gray-600 bg-gray-50',
                  };
                  const StatusIcon = status.icon;
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span>{formatDate(job.createdAt)}, {formatTime(job.createdAt)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                        >
                          <StatusIcon className={`h-3.5 w-3.5 ${job.status === 'PROCESSING' ? 'animate-spin' : ''}`} />
                          {status.label}
                        </span>
                        {job.error && (
                          <p className="text-xs text-red-500 mt-1 max-w-xs truncate" title={job.error}>
                            {job.error}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {job.totalRecords != null ? (
                          <Badge variant="outline">{job.totalRecords} listings</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const counts = remarkCounts?.[job.id];
                          if (!counts || job.status !== 'COMPLETED') {
                            return <span className="text-muted-foreground">-</span>;
                          }
                          const items = [
                            counts.new > 0 && (
                              <span key="new" className="inline-flex items-center gap-1 text-xs text-blue-600">
                                <Sparkles className="h-3 w-3" />
                                {counts.new} new
                              </span>
                            ),
                            counts.priceIncreased > 0 && (
                              <span key="up" className="inline-flex items-center gap-1 text-xs text-red-600">
                                <TrendingUp className="h-3 w-3" />
                                {counts.priceIncreased} price up
                              </span>
                            ),
                            counts.priceDecreased > 0 && (
                              <span key="down" className="inline-flex items-center gap-1 text-xs text-green-600">
                                <TrendingDown className="h-3 w-3" />
                                {counts.priceDecreased} price down
                              </span>
                            ),
                          ].filter(Boolean);
                          if (items.length === 0) {
                            return <span className="text-xs text-muted-foreground">No changes</span>;
                          }
                          return <div className="flex flex-col gap-1">{items}</div>;
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={job.status !== 'COMPLETED' || downloadingJobId === job.id}
                          onClick={() => handleDownload(job)}
                        >
                          {downloadingJobId === job.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-1 h-4 w-4" />
                          )}
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
