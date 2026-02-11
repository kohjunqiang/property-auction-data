'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Save, Loader2, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { saveCredentials, getCredentials, type CredsStatus } from '@/app/actions/user';

function StatusBadge({ status, updatedAt }: { status: CredsStatus; updatedAt: Date | null }) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Singapore',
    }).format(new Date(date));
  };

  if (status === 'working') {
    return (
      <div className="flex items-center gap-1.5 text-green-600">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-sm font-medium">Verified</span>
        {updatedAt && (
          <span className="text-xs text-muted-foreground">({formatDate(updatedAt)})</span>
        )}
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex items-center gap-1.5 text-red-600">
        <XCircle className="h-4 w-4" />
        <span className="text-sm font-medium">Failed</span>
        {updatedAt && (
          <span className="text-xs text-muted-foreground">({formatDate(updatedAt)})</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <HelpCircle className="h-4 w-4" />
      <span className="text-sm">Not verified</span>
    </div>
  );
}

export function CredentialsForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [credsStatus, setCredsStatus] = useState<CredsStatus>('unknown');
  const [statusUpdatedAt, setStatusUpdatedAt] = useState<Date | null>(null);

  // Load existing credentials on mount
  useEffect(() => {
    async function loadCredentials() {
      try {
        const creds = await getCredentials();
        if (creds) {
          setUsername(creds.username);
          setHasExistingPassword(creds.hasPassword);
          setTargetUrl(creds.targetUrl ?? '');
          setCredsStatus(creds.status);
          setStatusUpdatedAt(creds.statusUpdatedAt);
        }
      } catch (err) {
        console.error('Failed to load credentials:', err);
      } finally {
        setInitialLoading(false);
      }
    }

    loadCredentials();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      // Client-side validation
      if (!username) {
        setError('Username is required');
        return;
      }
      if (!hasExistingPassword && !password) {
        setError('Password is required');
        return;
      }

      // Save credentials via server action (server merges existing password if omitted)
      await saveCredentials(username, password || null, targetUrl || undefined);
      setSuccess(true);
      setHasExistingPassword(true);
      setCredsStatus('unknown'); // Reset status after save
      setStatusUpdatedAt(null);

      // Clear password field after successful save
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auction Site Credentials</CardTitle>
          <CardDescription>Loading saved credentials...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Auction Site Credentials</CardTitle>
            <CardDescription>
              Enter your credentials for the auction site. These will be securely encrypted.
            </CardDescription>
          </div>
          {hasExistingPassword && (
            <StatusBadge status={credsStatus} updatedAt={statusUpdatedAt} />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={hasExistingPassword ? '••••••••' : 'Enter your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {hasExistingPassword && (
              <p className="text-xs text-muted-foreground">
                Password is saved. Enter a new password to update.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetUrl">
              Target URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="targetUrl"
              type="url"
              placeholder="https://example.com/auctions"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Required. The auction listing page URL to scrape.
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && (
            <p className="text-sm text-green-500">Credentials saved successfully!</p>
          )}

          <Button type="submit" disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? 'Saving...' : 'Save Credentials'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
