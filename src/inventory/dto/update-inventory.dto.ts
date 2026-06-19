import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InventoryItemActualDto {
  @ApiProperty({ description: "ID de la ligne d'inventaire" })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ description: 'Stock réellement compté' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  actualStock!: number;

  @ApiPropertyOptional({
    description:
      "Motif libre justifiant l'écart entre stock théorique et réel (perte, casse, vol, erreur de comptage…). Optionnel mais conseillé dès qu'il y a un écart.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  varianceReason?: string;
}

export class UpdateInventoryDto {
  @ApiProperty({ type: [InventoryItemActualDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryItemActualDto)
  items!: InventoryItemActualDto[];
}

export class CancelInventoryDto {
  @ApiProperty({
    example: "Erreurs de comptage — recomptage demandé",
    description: "Motif d'annulation (min 3 caractères, conservé pour audit).",
  })
  @IsString()
  @MaxLength(500)
  reason!: string;
}
