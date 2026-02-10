import { Module } from '@nestjs/common';
import { ScrapeController } from './scrape.controller';
import { ScrapeProcessor } from './scrape.processor';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [ScrapeController],
  providers: [ScrapeProcessor],
})
export class ScrapeModule {}
