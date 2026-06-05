import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsHexColor,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateCompanySettingsDto {
  @ApiPropertyOptional({ example: 'SACPROMI' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  companyName?: string;

  @ApiPropertyOptional({ example: 'SARL' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  legalForm?: string;

  @ApiPropertyOptional({ example: '001234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ninea?: string;

  @ApiPropertyOptional({ example: 'SN-DKR-2026-A-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  rccm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Dakar' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Dakar' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ example: 'Sénégal' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: '+221 33 800 00 00' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone2?: string;

  @ApiPropertyOptional({ example: 'contact@sacpromi.sn' })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ example: 'https://sacpromi.sn' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(200)
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankAccount?: string;

  @ApiPropertyOptional({ example: 'Wave 77 123 45 67' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mobileMoney?: string;

  @ApiPropertyOptional({ description: 'ID Upload du logo (catégorie GENERIC).' })
  @IsOptional()
  @IsUUID()
  logoUploadId?: string;

  @ApiPropertyOptional({ example: '#047857' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#0ea5e9' })
  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  footerLegalText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  footerNote?: string;
}
