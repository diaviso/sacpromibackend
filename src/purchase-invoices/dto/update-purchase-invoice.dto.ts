import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/**
 * Met à jour les champs ADMIN d'une facture d'achat — sans toucher aux
 * lignes ni au fournisseur. Les lignes ne sont pas modifiables une fois
 * la facture créée car les lots, mouvements de stock et prix moyen
 * pondéré ont déjà été appliqués ; une correction passe par un
 * `cancel` + nouvelle saisie.
 *
 * Cas d'usage typique : corriger le n° de facture fournisseur, la date,
 * la note, ou ajouter/retirer le scan PDF.
 */
export class UpdatePurchaseInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplierInvoiceNumber?: string;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsOptional()
  @IsDateString()
  receptionDate?: string;

  @ApiPropertyOptional({ description: 'URL absolue du scan/photo (optionnel)' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  scanUrl?: string;
}
