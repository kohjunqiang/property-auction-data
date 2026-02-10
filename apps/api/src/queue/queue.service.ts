import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from '@repo/database';
import { PgmqQueue, PgmqSubscribeOptions } from '@repo/queue';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private queue: PgmqQueue;

  constructor(@Inject('DATABASE') private db: Kysely<DB>) {
    this.queue = new PgmqQueue(db);
  }

  async onModuleInit() {
    console.log('PGMQ queue service initialized');
  }

  async onModuleDestroy() {
    await this.queue.shutdown();
  }

  async addJob(queueName: string, data: object) {
    return this.queue.sendMessage(queueName, data);
  }

  async subscribe(
    queueName: string,
    handler: (job: { data: any; id: string }) => Promise<void>,
    options?: PgmqSubscribeOptions
  ) {
    return this.queue.subscribe(queueName, handler, options);
  }
}
