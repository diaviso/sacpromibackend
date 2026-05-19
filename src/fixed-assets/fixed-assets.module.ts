import { Module } from '@nestjs/common';
import { FixedAssetsController } from './fixed-assets.controller';
import { FixedAssetsService } from './fixed-assets.service';
import { FixedAssetsCron } from './fixed-assets.cron';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  imports: [TreasuryModule],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService, FixedAssetsCron],
  exports: [FixedAssetsService],
})
export class FixedAssetsModule {}
