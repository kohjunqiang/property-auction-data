import { Kysely, sql } from 'kysely';
import { DB } from '@repo/database';

export interface PgmqMessage {
  msg_id: string;
  read_ct: number;
  enqueued_at: Date;
  vt: Date;
  message: any;
}

export interface PgmqSubscribeOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  visibilityTimeoutSeconds?: number;
}

export class PgmqQueue {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private activeHandlers: Set<Promise<void>> = new Set();
  private isShuttingDown = false;

  constructor(private db: Kysely<DB>) {}

  /**
   * Create a new queue
   */
  async createQueue(queueName: string): Promise<void> {
    try {
      await sql`SELECT pgmq.create(${queueName})`.execute(this.db);
      console.log(`✅ Queue "${queueName}" created`);
    } catch (error: any) {
      // Queue might already exist, which is fine
      // PGMQ can return "already exists" or "already a member of extension" errors
      const isAlreadyExistsError =
        error.message?.includes('already exists') ||
        error.message?.includes('already a member');
      if (!isAlreadyExistsError) {
        throw error;
      }
      console.log(`✅ Queue "${queueName}" already exists`);
    }
  }

  /**
   * Send a message to a queue
   */
  async sendMessage(queueName: string, data: object, delaySeconds = 0): Promise<string> {
    const result = await sql<{ pgmq_send: string }>`
      SELECT * FROM pgmq.send(${queueName}::text, ${JSON.stringify(data)}::jsonb, ${delaySeconds}::integer)
    `.execute(this.db);

    return result.rows[0]?.pgmq_send;
  }

  /**
   * Send multiple messages to a queue
   */
  async sendBatch(queueName: string, messages: object[], delaySeconds = 0): Promise<string[]> {
    const jsonArray = messages.map((msg) => JSON.stringify(msg));
    const result = await sql<{ pgmq_send_batch: string }>`
      SELECT * FROM pgmq.send_batch(
        ${queueName},
        ${sql`ARRAY[${sql.join(jsonArray.map((j) => sql`${j}::jsonb`))}]`},
        ${delaySeconds}
      )
    `.execute(this.db);

    return result.rows.map((row) => row.pgmq_send_batch);
  }

  /**
   * Read messages from a queue
   */
  async readMessages(
    queueName: string,
    visibilityTimeoutSeconds = 30,
    quantity = 1
  ): Promise<PgmqMessage[]> {
    const result = await sql<PgmqMessage>`
      SELECT * FROM pgmq.read(${queueName}, ${visibilityTimeoutSeconds}, ${quantity})
    `.execute(this.db);

    return result.rows;
  }

  /**
   * Delete a message from a queue
   */
  async deleteMessage(queueName: string, msgId: string): Promise<boolean> {
    const result = await sql<{ pgmq_delete: boolean }>`
      SELECT * FROM pgmq.delete(${queueName}::text, ${msgId}::bigint)
    `.execute(this.db);

    return result.rows[0]?.pgmq_delete ?? false;
  }

  /**
   * Delete multiple messages from a queue
   */
  async deleteMessages(queueName: string, msgIds: string[]): Promise<string[]> {
    const result = await sql<{ pgmq_delete: string }>`
      SELECT * FROM pgmq.delete(${queueName}, ${sql`ARRAY[${sql.join(msgIds)}]`})
    `.execute(this.db);

    return result.rows.map((row) => row.pgmq_delete);
  }

  /**
   * Subscribe to a queue with a message handler
   */
  async subscribe(
    queueName: string,
    handler: (job: { data: any; id: string }) => Promise<void>,
    options: PgmqSubscribeOptions = {}
  ): Promise<void> {
    const {
      pollIntervalMs = 1000,
      batchSize = 1,
      visibilityTimeoutSeconds = 600,
    } = options;

    // Ensure queue exists
    await this.createQueue(queueName);

    // Start polling loop
    const poll = async () => {
      if (this.isShuttingDown) return;

      try {
        const messages = await this.readMessages(queueName, visibilityTimeoutSeconds, batchSize);

        for (const message of messages) {
          const handlerPromise = (async () => {
            try {
              await handler({
                data: message.message,
                id: message.msg_id,
              });
              // Delete only after successful processing
              await this.deleteMessage(queueName, message.msg_id);
            } catch (error) {
              console.error(`Error processing message ${message.msg_id}:`, error);
              // Message stays in queue and becomes visible again after visibility timeout
            }
          })();

          this.activeHandlers.add(handlerPromise);
          handlerPromise.finally(() => this.activeHandlers.delete(handlerPromise));

          // Await sequentially to maintain single-concurrency per poll cycle
          await handlerPromise;
        }
      } catch (error) {
        console.error(`Error polling queue ${queueName}:`, error);
      }
    };

    // Run initial poll
    await poll();

    // Set up polling interval
    const interval = setInterval(poll, pollIntervalMs);
    this.pollingIntervals.set(queueName, interval);

    console.log(`✅ Subscribed to queue "${queueName}" (polling every ${pollIntervalMs}ms)`);
  }

  /**
   * Unsubscribe from a queue
   */
  unsubscribe(queueName: string): void {
    const interval = this.pollingIntervals.get(queueName);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(queueName);
      console.log(`✅ Unsubscribed from queue "${queueName}"`);
    }
  }

  /**
   * Stop all subscriptions and cleanup
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    // Wait for in-flight handlers to complete
    if (this.activeHandlers.size > 0) {
      console.log(`Waiting for ${this.activeHandlers.size} in-flight handler(s) to complete...`);
      await Promise.allSettled([...this.activeHandlers]);
    }

    console.log('PGMQ shutdown complete');
  }
}
