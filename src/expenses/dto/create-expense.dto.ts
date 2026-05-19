import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseActivity } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty({ example: 75000 })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({ description: 'ID de la catégorie' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ enum: ExpenseActivity })
  @IsEnum(ExpenseActivity)
  activity!: ExpenseActivity;

  @ApiProperty({ example: '2026-04-15' })
  @IsDateString()
  expenseDate!: string;

  @ApiPropertyOptional({ description: 'Description (max 300 caractères)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  beneficiary?: string;

  @ApiPropertyOptional({ description: 'URL du justificatif (photo)' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  receiptUrl?: string;

  @ApiPropertyOptional({ description: 'Marquer comme dépense récurrente' })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional({ example: 1, description: 'Jour du mois pour récurrence (1-28)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  recurrenceDayOfMonth?: number;

  @ApiPropertyOptional({
    description:
      'ID du compte de trésorerie d\'où sort la dépense (caisse, banque, mobile money). Génère une écriture si CONFIRMED.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Salaires' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 1, description: "Ordre d'affichage" })
  @IsOptional()
  @IsInt()
  displayOrder?: number;
}
