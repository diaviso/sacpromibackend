/**
 * Interface d'abstraction du stockage de fichiers.
 *
 * Permet de switcher entre :
 * - LocalDiskStorage (disque local / Railway Volume) — implémentation par défaut
 * - S3CompatibleStorage (Cloudflare R2 / AWS S3 / Backblaze B2) — pour migration future
 *
 * Sans avoir à toucher au reste de l'application.
 */
export interface StorageService {
  /** Persiste un fichier et renvoie sa clé de stockage (unique, sans extension). */
  save(params: {
    fileBuffer: Buffer;
    storageKey: string; // ex: "abc-uuid.pdf"
  }): Promise<void>;

  /** Récupère un fichier par sa clé. Retourne null si introuvable. */
  read(storageKey: string): Promise<Buffer | null>;

  /** Vérifie si un fichier existe (sans le charger en mémoire). */
  exists(storageKey: string): Promise<boolean>;

  /** Supprime un fichier physiquement. No-op si déjà absent. */
  delete(storageKey: string): Promise<void>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
