import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UploadCategory, UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  UploadsService,
} from './uploads.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AnyAuthenticated } from '../common/decorators/any-authenticated.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

class UploadFileDto {
  @ApiPropertyOptional({ enum: UploadCategory, default: UploadCategory.GENERIC })
  @IsOptional()
  @IsEnum(UploadCategory)
  category?: UploadCategory;

  @ApiPropertyOptional({
    description:
      "Type d'entité liée (ex: PurchaseInvoice, Expense). Permet de retrouver tous les fichiers d'une entité.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceType?: string;

  @ApiPropertyOptional({ description: "ID de l'entité liée" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceId?: string;
}

@ApiTags('Uploads')
@ApiBearerAuth('JWT-auth')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post()
  @AnyAuthenticated()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Uploader un fichier (justificatif, scan, photo)',
    description:
      `Types acceptés : ${Array.from(ALLOWED_MIME_TYPES).join(', ')}. ` +
      `Taille max : ${MAX_UPLOAD_SIZE_BYTES / 1024 / 1024} MB. ` +
      `Le fichier est stocké sur disque avec un UUID, le vrai nom est conservé en BDD.`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        category: { type: 'string', enum: Object.values(UploadCategory) },
        referenceType: { type: 'string' },
        referenceId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu (champ multipart `file` manquant)');
    }
    return this.service.upload({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      category: dto.category,
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
      uploadedById: user.id,
    });
  }

  @Get(':id')
  @AnyAuthenticated()
  @ApiOperation({
    summary: 'Métadonnées d\'un upload (taille, nom, mime, qui a uploadé)',
    description:
      "Les justificatifs sensibles (scans factures, reçus, contrats) ne sont accessibles qu'au DIRECTOR ou à l'uploadeur.",
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Get(':id/download')
  @AnyAuthenticated()
  @ApiOperation({
    summary: 'Télécharger / pré-visualiser un fichier',
    description: 'Renvoie le binaire avec le bon Content-Type. Pour les images et PDF, le navigateur affiche inline. Contrôle d\'accès par catégorie (anti-IDOR).',
  })
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, originalName } = await this.service.download(id, user);
    // inline pour permettre l'aperçu navigateur (image, PDF) ;
    // le `filename` reste utilisé si le user clique "télécharger".
    const safeName = encodeURIComponent(originalName);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'private, max-age=300',
      // Helmet pose `Cross-Origin-Resource-Policy: same-origin` par défaut,
      // ce qui empêche le frontend Vercel de charger via <img src> les fichiers
      // servis depuis Railway. On rouvre EXPLICITEMENT pour ces téléchargements
      // (le token JWT dans la query string protège l'accès).
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.end(buffer);
  }

  @Delete(':id')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({
    summary: 'Supprimer un fichier (soft-delete BDD + suppression disque)',
    description: 'Réservé au DIRECTOR. La métadonnée est conservée pour audit.',
  })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
