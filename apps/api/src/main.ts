import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for Next.js frontend
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  // CRITICAL: Use port 3001 to avoid conflict with Next.js (port 3000)
  await app.listen(3001);
  console.log('API running on http://localhost:3001');
}
bootstrap();
