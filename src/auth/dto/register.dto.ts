import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'admin@sacpromi.sn', description: "Email de l'utilisateur" })
  @IsEmail({}, { message: "L'email doit être valide" })
  email!: string;

  @ApiProperty({ minLength: 8, example: 'MotDePasse123!', description: 'Mot de passe (minimum 8 caractères)' })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(100)
  password!: string;

  @ApiProperty({ example: 'Mamadou Diop', description: "Nom complet de l'utilisateur" })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ApiPropertyOptional({ example: '+221 77 123 45 67', description: 'Numéro de téléphone' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
