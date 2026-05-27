import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageService } from './storage.interface';

/**
 * Stockage sur disque local. En production sur Railway, on monte un Volume
 * sur le path indiqué par `UPLOAD_DIR` (ex: `/data/uploads`).
 *
 * En dev, le path par défaut est `./uploads` (relatif au CWD du backend).
 *
 * Sécurité :
 * - `storageKey` est validé en amont (uuid + extension whitelist)
 * - On rejette tout chemin contenant `..` ou `/` (anti path-traversal)
 */
@Injectable()
export class LocalDiskStorageService implements StorageService {
  private readonly logger = new Logger(LocalDiskStorageService.name);
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('UPLOAD_DIR', './uploads');
    this.baseDir = path.resolve(configured);
    this.ensureDirExists().catch((err) => {
      this.logger.error(`Impossible de créer le dossier d'upload ${this.baseDir}`, (err as Error).stack);
    });
    this.logger.log(`📁 Stockage uploads : ${this.baseDir}`);
  }

  private async ensureDirExists(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private resolveSafePath(storageKey: string): string {
    // Refuse path traversal et caractères dangereux
    if (storageKey.includes('..') || storageKey.includes('/') || storageKey.includes('\\') || storageKey.includes('\0')) {
      throw new Error(`Clé de stockage invalide : ${storageKey}`);
    }
    return path.join(this.baseDir, storageKey);
  }

  async save({ fileBuffer, storageKey }: { fileBuffer: Buffer; storageKey: string }): Promise<void> {
    await this.ensureDirExists();
    const fullPath = this.resolveSafePath(storageKey);
    await fs.writeFile(fullPath, fileBuffer);
  }

  async read(storageKey: string): Promise<Buffer | null> {
    try {
      const fullPath = this.resolveSafePath(storageKey);
      return await fs.readFile(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const fullPath = this.resolveSafePath(storageKey);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      const fullPath = this.resolveSafePath(storageKey);
      await fs.unlink(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // déjà absent : OK
      throw err;
    }
  }
}
