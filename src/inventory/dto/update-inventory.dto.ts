import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsUUID,
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
}

export class UpdateInventoryDto {
  @ApiProperty({ type: [InventoryItemActualDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryItemActualDto)
  items!: InventoryItemActualDto[];
}
