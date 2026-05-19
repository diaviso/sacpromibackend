import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Grossiste Céréales Kaolack' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: '+221 77 100 20 30' })
  @IsString()
  @MaxLength(30)
  phone!: string;

  @ApiProperty({ example: 'Marché central, Kaolack, Sénégal' })
  @IsString()
  @MaxLength(255)
  address!: string;

  @ApiPropertyOptional({ example: 'cereales.kaolack@example.sn' })
  @IsOptional()
  @IsEmail({}, { message: "L'email doit être valide" })
  email?: string;

  @ApiPropertyOptional({ example: 'Maïs, sorgho, mil' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  productsSupplied?: string;
}
