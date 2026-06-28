import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * DTO du mode "Achat comptoir" : creer un BC + reception + paiement en une
 * seule transaction. Cas d'usage : achat au marche, prelevement immediat.
 * Le BC est cree directement en statut VALIDATED, la facture immediatement
 * receptionnee, et le paiement (si fourni) immediatement enregistre.
 */
export class QuickPurchaseItemDto {
  @ApiProperty({ description: 'ID de la matiere premiere' })
  @IsUUID()
  rawMaterialId!: string;

  @ApiProperty({ example: 'Mais jaune' })
  @IsString()
  @MaxLength(150)
  itemName!: string;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @MaxLength(20)
  unit!: string;

  @ApiProperty({ example: 100 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ example: 250, description: 'Prix unitaire (FCFA)' })
  @IsInt()
  @Min(0)
  unitPrice!: number;
}

export class QuickPurchaseDto {
  @ApiProperty({ description: 'ID du fournisseur' })
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional({
    example: 'TICKET-2026-001',
    description:
      "Numero de la piece justificative fournisseur (ticket, facture papier). " +
      "Optionnel pour l'achat comptoir (souvent un simple ticket).",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  supplierInvoiceNumber?: string;

  @ApiPropertyOptional({ example: '2026-06-28' })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiPropertyOptional({ example: 5000, description: 'Frais transport global (reparti au prorata)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  transportCostTotal?: number;

  @ApiPropertyOptional({ description: 'URL du scan de la piece justificative' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  scanUrl?: string;

  @ApiProperty({ type: [QuickPurchaseItemDto], description: 'Lignes achetees (>= 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuickPurchaseItemDto)
  items!: QuickPurchaseItemDto[];

  // ── Paiement embarque ──────────────────────────────────────────────────
  // Si paidAmount > 0, on cree un SupplierPayment dans la meme transaction.
  // Si paymentAccountId est fourni, on cree aussi une ecriture tresorerie.
  // paidAmount = 0 (ou omis) => paiement differe a faire plus tard.

  @ApiPropertyOptional({ example: 25000, description: 'Montant paye au fournisseur a la caisse' })
  @IsOptional()
  @IsInt()
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Compte de tresorerie debite' })
  @IsOptional()
  @IsUUID()
  paymentAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
