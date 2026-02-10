'use client';

import { useEffect, useState } from 'react';
import { Download, Clock, CheckCircle, AlertCircle, Loader2, FileText, History } from 'lucide-react';
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
import { getScrapeJobs, type ScrapeJob } from '@/app/actions/scrape';

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
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    try {
      const data = await getScrapeJobs();
      setJobs(data);
    } catch (err) {
      console.error('Failed to fetch scrape jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Poll every 5s when there are active jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(j => j.status === 'PENDING' || j.status === 'PROCESSING');
    if (!hasActiveJobs) return;

    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs]);

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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const status = statusConfig[job.status];
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
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={job.status !== 'COMPLETED'}
                        >
                          <Download className="mr-1 h-4 w-4" />
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
