import { Global, Module } from '@nestjs/common';
import { SequenceService } from './services/sequence.service';

@Global()
@Module({
  providers: [SequenceService],
  exports: [SequenceService],
})
export class CommonModule {}
