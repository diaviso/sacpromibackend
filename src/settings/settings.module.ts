import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CompanySettingsController } from './settings.controller';

@Global()
@Module({
  controllers: [CompanySettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
