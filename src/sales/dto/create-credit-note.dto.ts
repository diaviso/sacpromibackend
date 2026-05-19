import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreditNoteItemDto {
  @ApiProperty({ description: 'ID de la ligne de la facture originale à retourner' })
  @IsUUID()
  saleItemId!: string;

  @ApiProperty({ example: 5, description: 'Quantité retournée' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;
}

export class CreateCreditNoteDto {
  @ApiProperty({ description: 'Motif du retour' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiProperty({ type: [CreditNoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreditNoteItemDto)
  items!: CreditNoteItemDto[];
}
