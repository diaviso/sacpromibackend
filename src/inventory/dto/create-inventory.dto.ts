import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateRawInventoryDto {
  @ApiPropertyOptional({
    description: "Date de l'inventaire (défaut : aujourd'hui)",
    example: '2026-04-30',
  })
  @IsOptional()
  @IsDateString()
  inventoryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    description:
      "Liste des matières à inclure. Si vide, toutes les matières actives sont incluses avec leur stock théorique.",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  rawMaterialIds?: string[];
}
