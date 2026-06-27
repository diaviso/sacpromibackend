import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SaleInvoiceType, SalePaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSaleItemDto {
  @ApiProperty({ description: 'ID du produit fini' })
  @IsUUID()
  finishedProductId!: string;

  @ApiProperty({ example: 50 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Prix unitaire négocié (sinon prix gros/détail du client)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPrice?: number;
}

export class CreateSaleDto {
  @ApiProperty({ enum: SaleInvoiceType, description: 'Facture (gros) ou Reçu (détail)' })
  @IsEnum(SaleInvoiceType)
  type!: SaleInvoiceType;

  @ApiProperty({ description: 'ID du client (utilisez le client comptoir pour les ventes anonymes détail)' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ description: 'ID de la commande source' })
  @IsOptional()
  @IsUUID()
  customerOrderId?: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  invoiceDate!: string;

  @ApiProperty({ enum: SalePaymentMethod })
  @IsEnum(SalePaymentMethod)
  paymentMethod!: SalePaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];

  @ApiPropertyOptional({
    default: false,
    description:
      "Bypass du plafond crédit (réservé au directeur — la vente est créée même si le plafond du client est dépassé, avec un warning en réponse).",
  })
  @IsOptional()
  @IsBoolean()
  overrideCreditLimit?: boolean;

  // ── Mode CAISSE (POS) — paiement direct + remise ─────────────────────────
  // Ces 4 champs permettent de creer la facture, encaisser et tracer une
  // remise en un seul appel atomique. Utilises principalement par la page
  // /caisse qui n'a pas besoin d'enchainer 3 endpoints pour finaliser une
  // vente au comptoir.

  @ApiPropertyOptional({
    example: 5000,
    description:
      "Montant de la remise en FCFA appliquee sur le total ligne (avant arrondi). Reduit le totalAmount final de la facture.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({
    description: 'Motif de la remise (fidelite, geste commercial, soldes...)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  discountReason?: string;

  @ApiPropertyOptional({
    example: 35000,
    description:
      "Montant encaisse au moment de la vente. Si fourni, un CustomerPayment est cree dans la meme transaction. Peut etre inferieur au total (creance generee), egal (facture soldee) ou superieur (rendu monnaie — gere cote frontend).",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({
    description:
      'Compte de tresorerie qui recoit le paiement. Requis si paidAmount > 0. Defaut : aucun (paiement sans compte).',
  })
  @IsOptional()
  @IsUUID()
  paymentAccountId?: string;
}
