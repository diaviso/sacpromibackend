import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * DTO de creation d'un avoir fournisseur.
 *
 * - `purchaseInvoiceId` : la reception parent (source de la marchandise retournee)
 * - `items` : lignes a retourner. Chaque item designe une ligne de la
 *   facture parent par `purchaseInvoiceItemId` (qui porte le lot via le
 *   `rawMaterialLot`). Quantite a retourner <= quantite recue.
 */
export class CreateSupplierCreditNoteItemDto {
  @ApiProperty({
    description: "ID de la ligne de la facture parent (purchase_invoice_items.id)",
  })
  @IsUUID()
  purchaseInvoiceItemId!: string;

  @ApiProperty({ example: 5, description: 'Quantite a retourner' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;
}

export class CreateSupplierCreditNoteDto {
  @ApiProperty({ description: 'ID de la reception (facture d\'achat) parent' })
  @IsUUID()
  purchaseInvoiceId!: string;

  @ApiProperty({ example: '2026-06-28' })
  @IsDateString()
  creditDate!: string;

  @ApiProperty({
    description: "Motif obligatoire (minimum 5 caracteres)",
    example: 'Marchandise non conforme — sacs eventres',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @ApiProperty({
    type: [CreateSupplierCreditNoteItemDto],
    description: 'Lignes a retourner (>= 1)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSupplierCreditNoteItemDto)
  items!: CreateSupplierCreditNoteItemDto[];
}
