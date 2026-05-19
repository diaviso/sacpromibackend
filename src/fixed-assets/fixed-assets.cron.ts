import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FixedAssetsService } from './fixed-assets.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cron mensuel : génère les dotations aux amortissements le 1er de chaque mois à 02h00
 * pour le mois précédent. Idempotent grâce à la contrainte unique (asset, year, month).
 */
@Injectable()
export class FixedAssetsCron {
  private readonly logger = new Logger(FixedAssetsCron.name);

  constructor(
    private readonly service: FixedAssetsService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 2 1 * *', { name: 'monthly-depreciation', timeZone: 'Africa/Dakar' })
  async runMonthly() {
    const now = new Date();
    // Mois précédent
    const target = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = target.getFullYear();
    const month = target.getMonth() + 1;

    // Récupère un utilisateur DIRECTOR comme "system"
    const systemUser = await this.prisma.user.findFirst({
      where: { role: 'DIRECTOR', isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!systemUser) {
      this.logger.warn('Aucun DIRECTOR actif — dotations mensuelles non générées');
      return;
    }

    try {
      const res = await this.service.runMonthlyDepreciation(year, month, systemUser.id);
      this.logger.log(
        `[Cron] Dotations ${year}-${String(month).padStart(2, '0')} : ${res.created.length} entrées (total ${res.totalAmount})`,
      );
    } catch (err) {
      this.logger.error(`[Cron] Échec génération dotations : ${(err as Error).message}`);
    }
  }
}
