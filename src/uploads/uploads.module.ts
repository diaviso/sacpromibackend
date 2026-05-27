import { Global, Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { LocalDiskStorageService } from './local-disk-storage.service';
import { STORAGE_SERVICE } from './storage.interface';

/**
 * Module Uploads marqué @Global pour que les autres modules puissent
 * injecter UploadsService (utile par ex. si on veut nettoyer les uploads
 * orphelins lors d'une suppression cascade).
 */
@Global()
@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    LocalDiskStorageService,
    { provide: STORAGE_SERVICE, useExisting: LocalDiskStorageService },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
