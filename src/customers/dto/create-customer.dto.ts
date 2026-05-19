import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerPriceCategory, CustomerType } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Boutique Touba Avicole' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: '+221 77 555 11 22' })
  @IsString()
  @MaxLength(30)
  phone!: string;

  @ApiProperty({ example: 'Touba, Sénégal' })
  @IsString()
  @MaxLength(255)
  address!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: "L'email doit être valide" })
  email?: string;

  @ApiProperty({ enum: CustomerType, example: CustomerType.RESELLER })
  @IsEnum(CustomerType)
  type!: CustomerType;

  @ApiProperty({ enum: CustomerPriceCategory, example: CustomerPriceCategory.WHOLESALE })
  @IsEnum(CustomerPriceCategory)
  priceCategory!: CustomerPriceCategory;

  @ApiPropertyOptional({ example: '30 jours' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentTerms?: string;

  @ApiPropertyOptional({ example: 500000, description: 'Plafond crédit (FCFA, 0 = pas de limite)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional({ description: 'Marquer comme "Client comptoir" (anonyme)' })
  @IsOptional()
  @IsBoolean()
  isWalkIn?: boolean;
}
