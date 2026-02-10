'use client';

import { useState } from 'react';
import { startScrape } from '@/app/actions/scrape';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Play } from 'lucide-react';

export function ScrapeForm() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleStart() {
    setError(null);
    setSuccess(false);
    setIsLoading(true);

    try {
      const response = await startScrape();
      if (response.jobId) {
        setSuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scrape. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Extraction</CardTitle>
        <CardDescription>
          Start scraping auction listings using the URL configured in Settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button onClick={handleStart} size="lg" disabled={isLoading}>
            <Play className="mr-2 h-4 w-4" />
            {isLoading ? 'Starting...' : 'Start Extraction'}
          </Button>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && (
            <p className="text-sm text-green-500">Scrape job queued successfully!</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
