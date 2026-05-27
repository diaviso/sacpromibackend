import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UploadCategory } from '@prisma/client';
import * as crypto from 'crypto';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from './storage.interface';

// Whitelist explicite : on n'accepte que les formats utiles aux justificatifs
// (et qui sont sûrs à servir/preview dans un navigateur).
export const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic', // photos iPhone
  'image/heif',
  'application/pdf',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface UploadParams {
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category?: UploadCategory;
  referenceType?: string;
  referenceId?: string;
  uploadedById: string;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async upload(params: UploadParams) {
    if (!ALLOWED_MIME_TYPES.has(params.mimeType)) {
      throw new BadRequestException(
        `Type de fichier non autorisé : ${params.mimeType}. Formats acceptés : JPG, PNG, WEBP, HEIC, PDF.`,
      );
    }
    if (params.sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException(
        `Fichier trop volumineux : ${(params.sizeBytes / 1024 / 1024).toFixed(1)} MB. ` +
          `Maximum autorisé : ${MAX_UPLOAD_SIZE_BYTES / 1024 / 1024} MB.`,
      );
    }
    if (params.sizeBytes === 0) {
      throw new BadRequestException('Fichier vide');
    }

    // Génère un nom de fichier unique pour éviter les collisions et masquer
    // le vrai nom de fichier (sécurité). On garde uniquement l'extension
    // depuis la table MIME → ext (jamais depuis le nom original = injection).
    const ext = MIME_TO_EXT[params.mimeType] ?? 'bin';
    const storageKey = `${crypto.randomUUID()}.${ext}`;

    // Persiste le fichier sur disque AVANT de créer la ligne en BDD
    // pour éviter une ligne orpheline si l'écriture disque échoue.
    try {
      await this.storage.save({ fileBuffer: params.fileBuffer, storageKey });
    } catch (err) {
      this.logger.error(`Échec save fichier ${storageKey}`, (err as Error).stack);
      throw new BadRequestException("Impossible d'enregistrer le fichier sur le disque");
    }

    // On garde le nom original tel quel (pour le download), mais on
    // tronque à 200 chars pour éviter des UI cassées.
    const safeOriginalName = (params.originalName || 'fichier').slice(0, 200);

    try {
      const upload = await this.prisma.upload.create({
        data: {
          storageKey,
          originalName: safeOriginalName,
          mimeType: params.mimeType,
          sizeBytes: params.sizeBytes,
          category: params.category ?? UploadCategory.GENERIC,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          uploadedById: params.uploadedById,
        },
      });
      return upload;
    } catch (err) {
      // Si la BDD échoue, on supprime le fichier qu'on vient d'écrire
      // pour éviter un orphelin sur disque.
      this.logger.error(`Échec création row Upload, rollback fichier ${storageKey}`, (err as Error).stack);
      await this.storage.delete(storageKey).catch(() => undefined);
      throw err;
    }
  }

  async findOne(id: string) {
    const upload = await this.prisma.upload.findUnique({
      where: { id },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
    if (!upload || upload.deletedAt) {
      throw new NotFoundException('Fichier introuvable');
    }
    return upload;
  }

  /** Renvoie le binaire pour servir au client. */
  async download(id: string): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    const upload = await this.findOne(id);
    const buffer = await this.storage.read(upload.storageKey);
    if (!buffer) {
      throw new NotFoundException("Fichier disparu du disque (corruption ou suppression manuelle)");
    }
    return { buffer, mimeType: upload.mimeType, originalName: upload.originalName };
  }

  /**
   * Soft-delete : marque deletedAt + supprime le fichier du disque.
   * On garde la ligne en BDD pour l'audit (qui a uploadé quoi quand).
   */
  async remove(id: string) {
    const upload = await this.findOne(id);
    await this.prisma.upload.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.storage.delete(upload.storageKey).catch((err) => {
      this.logger.warn(`Échec delete physique ${upload.storageKey}`, (err as Error).stack);
    });
    return { message: 'Fichier supprimé' };
  }

  /**
   * Liste les uploads liés à une entité métier (ex: toutes les pièces jointes
   * d'une facture d'achat).
   */
  async listByReference(referenceType: string, referenceId: string) {
    return this.prisma.upload.findMany({
      where: { referenceType, referenceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }
}

// Helper export
export { path };
