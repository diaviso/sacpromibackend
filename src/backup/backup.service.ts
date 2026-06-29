import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  /**
   * Sauvegarde quotidienne PostgreSQL — déclenchée chaque jour à 03h00 (Africa/Dakar).
   * Utilise le script approprié selon la plateforme.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async dailyBackup() {
    this.logger.log('🔄 Démarrage de la sauvegarde quotidienne PostgreSQL');

    const isWindows = process.platform === 'win32';
    const scriptPath = path.join(
      process.cwd(),
      'scripts',
      isWindows ? 'backup-db.ps1' : 'backup-db.sh',
    );

    if (!fs.existsSync(scriptPath)) {
      this.logger.error(
        `Script de sauvegarde introuvable : ${scriptPath}. ` +
          "Vérifiez que le dossier 'scripts/' est bien inclus dans l'image.",
      );
      return;
    }

    // Audit LOT 7 : on vérifie que pg_dump est disponible AVANT de lancer le
    // script, pour émettre un message clair et actionnable plutôt qu'un échec
    // silencieux (l'ancienne image alpine ne contenait pas postgresql-client).
    if (!isWindows && !(await this.isPgDumpAvailable())) {
      this.logger.error(
        "❌ pg_dump introuvable : sauvegarde impossible. Installez postgresql-client " +
          '(déjà ajouté au Dockerfile) ou appuyez-vous sur les sauvegardes managées de votre hébergeur.',
      );
      return;
    }

    try {
      const command = isWindows
        ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
        : `bash "${scriptPath}"`;

      const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });
      if (stdout) this.logger.log(stdout.trim());
      if (stderr && !stderr.includes('NOTICE')) this.logger.warn(stderr.trim());

      this.logger.log('✅ Sauvegarde quotidienne terminée');
    } catch (err) {
      this.logger.error('❌ Échec de la sauvegarde quotidienne', err as Error);
    }
  }

  private async isPgDumpAvailable(): Promise<boolean> {
    try {
      await execAsync('pg_dump --version');
      return true;
    } catch {
      return false;
    }
  }
}
