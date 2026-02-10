# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Property auction data SaaS application for scraping and managing property auction listings from Malaysian auction sites. Users authenticate, save encrypted auction site credentials, and trigger scraping jobs that run asynchronously via a PostgreSQL-based message queue. Features include listing filtering, sorting, and Excel export.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Shadcn/Radix UI
- **Backend**: NestJS, TypeScript
- **Database**: PostgreSQL with Kysely ORM
- **Authentication**: Supabase Auth (JWT-based)
- **Job Queue**: PostgreSQL PGMQ (native PostgreSQL message queue)
- **Web Scraping**: Playwright with stealth anti-detection patches
- **Encryption**: AES-256-GCM for credential storage (`@repo/crypto`)
- **Excel Export**: xlsx library for listing data export

## Commands

```bash
pnpm dev          # Start frontend (port 3000) and backend (port 3001)
pnpm build        # Build all packages and apps
pnpm lint         # Run linting across all packages

# Database (run from packages/database)
pnpm db:generate  # Generate TypeScript types from database schema (kysely-codegen)
pnpm db:push      # Run database migrations

# Standalone scrape test (no database required)
npx tsx apps/api/src/scrape/test-scrape.ts <url> <username> <password>
```

## Monorepo Structure

```
apps/
  web/              # Next.js frontend - dashboard, scrape forms, data tables, Excel export
  api/              # NestJS backend - scrape endpoints, job processing, credential validation
packages/
  database/         # PostgreSQL + Kysely ORM, migrations (10 total), type generation
  schema/           # Shared Zod validation schemas (Scrape, Listing, Credentials)
  queue/            # PGMQ wrapper for async job processing
  crypto/           # AES-256-GCM encryption for user credentials
  typescript-config/# Shared TypeScript configurations
```

## Architecture

### Authentication Flow
1. Frontend authenticates via Supabase Auth
2. JWT token sent in Authorization header to backend
3. `SupabaseAuthGuard` validates JWT and attaches user to request
4. `@CurrentUser()` decorator injects user into controller methods

### Job Processing Flow
1. Frontend calls `startScrape()` server action → `POST /scrapes`
2. `ScrapeController` validates user has saved credentials and target URL (400 if not)
3. Creates `scrape_jobs` record, enqueues message to PGMQ
4. `ScrapeProcessor` subscribes to queue, launches stealth Playwright browser
5. Processor logs in with decrypted user credentials, scrapes target URL
6. Updates job status, `total_records`, and inserts listings into database
7. Updates user's `creds_status` to 'working' or 'failed' based on login result

### Credential Encryption
1. User saves credentials via `saveCredentials()` server action
2. `@repo/crypto` encrypts with AES-256-GCM using `CREDENTIALS_ENCRYPTION_KEY`
3. Encrypted credentials stored in `users` table with `creds_encrypted` flag
4. Decrypted at scrape time by the processor

### Frontend Routes
- `/` → redirects to `/dashboard`
- `/login` → Login page (redirects to dashboard if authenticated)
- `/dashboard` → Main dashboard with tabs: Data Extraction, Activity, Settings
- `/scrapes` → Scrape job history with polling for active jobs
- `/settings` → Auction site credentials form

### Key Modules

**Frontend (apps/web)**
- `/src/app/actions/scrape.ts` - `startScrape()`, `getScrapeJobs()`
- `/src/app/actions/listings.ts` - `getListings(filters?)` with status/tenure/job filtering
- `/src/app/actions/user.ts` - `saveCredentials()`, `getCredentials()`, `hasCredentialsConfigured()`
- `/src/components/data-extraction.tsx` - Listing table with filtering, sorting, Excel export
- `/src/components/dashboard/activity-table.tsx` - Scrape job history with 5s polling
- `/src/components/settings/credentials-form.tsx` - Credential management with status display
- `/src/middleware.ts` - Route protection (protects `/dashboard/*`, `/scrapes/*`, `/settings/*`)
- `/src/lib/supabase/` - Client and server Supabase instances

**Backend (apps/api)**
- `/src/scrape/scrape.controller.ts` - Scrape endpoints with credential validation
- `/src/scrape/scrape.processor.ts` - Job worker with login, pagination, extraction
- `/src/scrape/stealth-browser.ts` - Anti-detection: random viewports/UAs, webdriver hiding, human behavior simulation
- `/src/scrape/test-scrape.ts` - Standalone test script (no DB dependency)
- `/src/auth/` - SupabaseAuthGuard, CurrentUser decorator
- `/src/database/` - DatabaseModule providing Kysely instance

**Database (packages/database)**
- `/migrations/` - 10 TypeScript migration files
- Tables: `users`, `scrape_jobs`, `listings`
- Enums: `listing_status` (ACTIVE, RESERVED, CALLED_OFF), `tenure` (NONE, FREEHOLD, LEASEHOLD), `creds_status` (unknown, working, failed)
- Notable columns: `users.creds_encrypted`, `users.creds_status`, `scrape_jobs.total_records`
- Unique constraint on `listings(scrape_job_id, address)` to prevent duplicates

## Environment Variables

**apps/api/.env**
- `DATABASE_URL` - PostgreSQL connection string
- `SCRAPE_QUEUE_NAME` - PGMQ queue name
- `SUPABASE_URL` - Supabase project URL (for auth validation)
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `CREDENTIALS_ENCRYPTION_KEY` - 32-byte base64 key for AES-256-GCM encryption
- `HEADLESS_MODE` - Controls Playwright headless mode (`true`/`false`, default: headed)

**apps/web/.env.local**
- `NEXT_PUBLIC_API_URL` - Backend URL (http://localhost:3001)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `DATABASE_URL` - PostgreSQL connection string (for server actions)
- `CREDENTIALS_ENCRYPTION_KEY` - Same encryption key as backend

## Scrape Target Notes

The scrape target (bp.erp213.com) uses hash-based AJAX routing. Key implementation details:
- `networkidle` fires before AJAX content renders — use `waitForFunction` to check actual content
- After login, don't re-navigate; the site auto-redirects to the listing page
- Pagination: click the "Next" link directly (don't use `page.goto` for hash navigation)
- Last page still has "Next" link in DOM — break when `allListings.length >= totalRecords`
- Browser-context code must use strings (not typed functions) to avoid TypeScript DOM type errors

## Timezone

- Frontend formats dates in `Asia/Singapore` (GMT+8)
- Backend Playwright context uses `Asia/Kuala_Lumpur`
