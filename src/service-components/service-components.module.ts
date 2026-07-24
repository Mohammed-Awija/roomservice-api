import { Module } from '@nestjs/common';
import { ServiceComponentsService } from './service-components.service';
import { ServiceComponentsController } from './service-components.controller';

@Module({
  providers: [ServiceComponentsService],
  controllers: [ServiceComponentsController],
})
export class ServiceComponentsModule {}
