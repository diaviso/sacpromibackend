import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Purge périodique des tokens expirés (audit LOT 3) :
 *  - `RevokedToken` : la blacklist de logout grossissait sans borne.
 *  - `PasswordResetToken` : tokens utilisés ou expirés.
 *
 * Sans ce nettoyage, ces tables croissaient indéfiniment, alourdissant les
 * lookups effectués à chaque requête authentifiée (JwtStrategy).
 */
@Injectable()
export class TokenCleanupCron {
  private readonly logger = new Logger(TokenCleanupCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeExpiredTokens() {
    const now = new Date();
    try {
      const revoked = await this.prisma.revokedToken.deleteMany({
        where: { expiresAt: { lt: now } },
      });
      const resets = await this.prisma.passwordResetToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
        },
      });
      if (revoked.count || resets.count) {
        this.logger.log(
          `Purge tokens : ${revoked.count} révoqués + ${resets.count} reset supprimés.`,
        );
      }
    } catch (err) {
      this.logger.error('Échec purge des tokens expirés', (err as Error).stack);
    }
  }
}
