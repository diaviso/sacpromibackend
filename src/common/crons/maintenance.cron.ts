import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoanScheduleItemStatus, LotStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Crons de maintenance des statuts (audit LOT 5 — données capturées mais jamais
 * exploitées) :
 *  - Échéances de prêt en retard → OVERDUE (statut jamais posé auparavant).
 *  - Lots (MP & PF) dont la date de péremption est dépassée → EXPIRED
 *    (le statut EXPIRED existait mais n'était jamais positionné).
 *
 * Exécuté chaque jour à 02h00 (Africa/Dakar). Idempotent par construction
 * (updateMany filtré sur l'état courant → ne touche que ce qui change).
 */
@Injectable()
export class MaintenanceCron {
  private readonly logger = new Logger(MaintenanceCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDailyMaintenance() {
    const now = new Date();
    await Promise.all([
      this.markOverdueLoanInstallments(now),
      this.markExpiredLots(now),
    ]);
  }

  /** Marque OVERDUE les échéances échues non soldées. */
  async markOverdueLoanInstallments(now: Date) {
    try {
      const res = await this.prisma.loanScheduleItem.updateMany({
        where: {
          dueDate: { lt: now },
          status: {
            in: [LoanScheduleItemStatus.PENDING, LoanScheduleItemStatus.PARTIALLY_PAID],
          },
        },
        data: { status: LoanScheduleItemStatus.OVERDUE },
      });
      if (res.count) this.logger.log(`Échéances de prêt passées en OVERDUE : ${res.count}`);
    } catch (err) {
      this.logger.error('Échec mise à jour des échéances OVERDUE', (err as Error).stack);
    }
  }

  /** Marque EXPIRED les lots ACTIFS dont la date de péremption est dépassée. */
  async markExpiredLots(now: Date) {
    try {
      const [raw, finished] = await Promise.all([
        this.prisma.rawMaterialLot.updateMany({
          where: { status: LotStatus.ACTIVE, expirationDate: { not: null, lt: now } },
          data: { status: LotStatus.EXPIRED },
        }),
        this.prisma.finishedProductLot.updateMany({
          where: { status: LotStatus.ACTIVE, expirationDate: { not: null, lt: now } },
          data: { status: LotStatus.EXPIRED },
        }),
      ]);
      if (raw.count || finished.count) {
        this.logger.log(
          `Lots passés en EXPIRED : ${raw.count} MP + ${finished.count} PF`,
        );
      }
    } catch (err) {
      this.logger.error('Échec mise à jour des lots EXPIRED', (err as Error).stack);
    }
  }
}
