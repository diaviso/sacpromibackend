import { Global, Module } from '@nestjs/common';
import { SequenceService } from './services/sequence.service';
import { MaintenanceCron } from './crons/maintenance.cron';

@Global()
@Module({
  providers: [SequenceService, MaintenanceCron],
  exports: [SequenceService],
})
export class CommonModule {}
