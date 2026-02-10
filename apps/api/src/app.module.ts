import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';
import { ScrapeModule } from './scrape/scrape.module';
import { AuthModule } from './auth/auth.module';
import { SupabaseAuthGuard } from './auth/supabase-auth.guard';

@Module({
  imports: [DatabaseModule, QueueModule, ScrapeModule, AuthModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
  ],
})
export class AppModule {}
