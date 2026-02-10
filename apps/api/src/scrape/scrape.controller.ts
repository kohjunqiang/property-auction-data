import { Controller, Post, Inject, BadRequestException } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';
import { Kysely } from 'kysely';
import { DB, createId } from '@repo/database';
import { CurrentUser } from '../auth/current-user.decorator';
import { decryptCredentials, isEncryptedFormat, type EncryptedData } from '@repo/crypto';

@Controller('scrapes')
export class ScrapeController {
  constructor(
    @Inject('DATABASE') private db: Kysely<DB>,
    private readonly queueService: QueueService,
  ) {}

  @Post()
  async create(@CurrentUser() user: any) {
    // Fetch user's saved credentials from database
    const dbUser = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirst();

    // Empty Settings Guard - check credentials exist
    if (!dbUser?.creds) {
      throw new BadRequestException('Please configure your credentials in Settings first.');
    }

    // Decrypt credentials
    let creds: { username: string; password: string; targetUrl?: string };
    const userRecord = dbUser as typeof dbUser & { creds_encrypted?: boolean };
    if (userRecord.creds_encrypted && isEncryptedFormat(dbUser.creds)) {
      creds = decryptCredentials(dbUser.creds as unknown as EncryptedData);
    } else {
      creds = dbUser.creds as unknown as { username: string; password: string; targetUrl?: string };
    }

    // Empty Settings Guard - check targetUrl exists
    if (!creds.targetUrl) {
      throw new BadRequestException('Please configure your Target URL in Settings first.');
    }

    // Create ScrapeJob record in database
    const jobId = createId();
    await this.db
      .insertInto('scrape_jobs')
      .values({
        id: jobId,
        url: creds.targetUrl,
        user_id: user.id,
        settings: null,
        status: 'PENDING',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();

    // Add job to PGMQ queue
    await this.queueService.addJob(process.env.SCRAPE_QUEUE_NAME!, {
      jobId: jobId,
      userId: user.id,
      url: creds.targetUrl,
    });

    return { jobId: jobId, status: 'QUEUED' };
  }
}
