import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController, SettingsController } from './reports.controller';

@Module({
  controllers: [ReportsController, SettingsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
