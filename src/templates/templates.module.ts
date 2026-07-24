import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';

@Module({
  providers: [TemplatesService],
  controllers: [TemplatesController],
  // PublicModule resolves guest-page tokens through this service.
  exports: [TemplatesService],
})
export class TemplatesModule {}
