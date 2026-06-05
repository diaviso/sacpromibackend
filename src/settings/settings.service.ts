import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

const SINGLETON_ID = 'default';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retourne la fiche entreprise (singleton). Crée une ligne vierge à la
   * volée si la base n'en a pas encore — comme ça les PDF marchent dès le
   * premier déploiement, et l'utilisateur n'a qu'à compléter.
   *
   * Garbage-collect du logo orphelin : si `logoUploadId` pointe vers un
   * Upload qui n'existe plus ou a été soft-deleted (cas Railway sans Volume
   * persistant), on auto-corrige à `null` en base ET on retourne null dans
   * la réponse. Le frontend ne tentera plus de fetch un fichier 404.
   */
  async get() {
    let settings = await this.prisma.companySettings.findUnique({
      where: { id: SINGLETON_ID },
      include: { updatedBy: { select: { id: true, fullName: true } } },
    });
    if (!settings) {
      this.logger.log('Création de la ligne CompanySettings par défaut');
      await this.prisma.companySettings.create({
        data: {
          id: SINGLETON_ID,
          companyName: 'SACPROMI',
        },
      });
      settings = await this.prisma.companySettings.findUnique({
        where: { id: SINGLETON_ID },
        include: { updatedBy: { select: { id: true, fullName: true } } },
      });
    }

    // Logo orphelin → on nettoie pour eviter les 404 cote frontend.
    if (settings?.logoUploadId) {
      const upload = await this.prisma.upload.findFirst({
        where: { id: settings.logoUploadId, deletedAt: null },
        select: { id: true },
      });
      if (!upload) {
        this.logger.warn(
          `Logo upload ${settings.logoUploadId} introuvable — nettoyage en base`,
        );
        await this.prisma.companySettings.update({
          where: { id: SINGLETON_ID },
          data: { logoUploadId: null },
        });
        settings = { ...settings, logoUploadId: null };
      }
    }

    return settings;
  }

  async update(dto: UpdateCompanySettingsDto, userId: string) {
    // S'assure que le singleton existe
    await this.get();
    const updated = await this.prisma.companySettings.update({
      where: { id: SINGLETON_ID },
      data: { ...dto, updatedById: userId },
      include: { updatedBy: { select: { id: true, fullName: true } } },
    });
    this.logger.log(`Paramètres entreprise mis à jour par user ${userId}`);
    return updated;
  }
}
