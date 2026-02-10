import { ActivityTable } from '@/components/dashboard/activity-table';

export default function ScrapesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Scrapes</h1>
        <p className="text-muted-foreground">
          View and manage all your scraping jobs
        </p>
      </div>

      <ActivityTable />
    </div>
  );
}
