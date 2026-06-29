import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/strong-password.decorator';

export class RegisterDto {
  @ApiProperty({ example: 'admin@sacpromi.sn', description: "Email de l'utilisateur" })
  @IsEmail({}, { message: "L'email doit être valide" })
  email!: string;

  @ApiProperty({ minLength: 12, example: 'MotDePasseFort123', description: 'Mot de passe (≥ 12 caractères, maj + min + chiffre)' })
  @IsStrongPassword()
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
