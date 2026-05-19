import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  imports: [ScheduleModule.forRoot(), TreasuryModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
