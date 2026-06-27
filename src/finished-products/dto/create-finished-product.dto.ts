import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinishedProductCategory } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFinishedProductDto {
  @ApiProperty({ example: 'ALI-PCC-50' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Aliment poulet chair croissance — sac 50 kg' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: FinishedProductCategory })
  @IsEnum(FinishedProductCategory)
  category!: FinishedProductCategory;

  @ApiProperty({
    example: 'sac 50 kg',
    description:
      "Unité de mesure libre (kg, sac 25kg, carton, palette…). Les valeurs historiques de l'enum FinishedProductUnit (KG, BAG_50KG…) restent valides.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @ApiProperty({ example: 18000, description: 'Prix de vente gros (FCFA)' })
  @IsInt()
  @Min(0)
  wholesalePrice!: number;

  @ApiProperty({ example: 19500, description: 'Prix de vente détail (FCFA)' })
  @IsInt()
  @Min(0)
  retailPrice!: number;

  @ApiPropertyOptional({ example: 50, description: "Seuil d'alerte (quantité)" })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  alertThreshold?: number;

  @ApiPropertyOptional({
    description:
      "Image illustrative du produit (FK Upload). Affichee dans le catalogue et la Caisse.",
  })
  @IsOptional()
  @IsUUID()
  imageUploadId?: string;
}
