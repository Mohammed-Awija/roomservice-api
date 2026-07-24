import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LocationsModule } from './locations/locations.module';
import { OfferingNodesModule } from './offering-nodes/offering-nodes.module';
import { PublicModule } from './public/public.module';
import { RequestsModule } from './requests/requests.module';
import { ServiceComponentsModule } from './service-components/service-components.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 20, // max 20 requests per 60s per IP
      },
    ]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    OfferingNodesModule,
    PublicModule,
    RequestsModule,
    ServiceComponentsModule,
    TemplatesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
