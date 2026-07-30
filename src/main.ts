import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Every route is now prefixed with /api
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not in the DTO
      forbidNonWhitelisted: true, // reject requests with unknown properties
      transform: true, // auto-transform payloads to DTO types
    }),
  );

  // Read allowed origins from env var (comma-separated), fall back to localhost for dev.
  // Strip any trailing slash: browsers send `Origin` with no trailing slash, and
  // enableCors does exact-string match, so `https://site.app/` in the env var would
  // silently never match `https://site.app` from the browser.
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) =>
        s.trim().replace(/\/+$/, ''),
      )
    : ['http://localhost:3000'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001);
}
// `void`: bootstrap is the top-level entrypoint; nothing awaits it by design.
void bootstrap();
