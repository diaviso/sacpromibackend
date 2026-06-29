import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/strong-password.decorator';

export class CreateUserDto {
  @ApiProperty({ example: 'commercial@sacpromi.sn' })
  @IsEmail({}, { message: "L'email doit être valide" })
  email!: string;

  @ApiProperty({ minLength: 12, example: 'TempPassFort123', description: 'Mot de passe initial (≥ 12 caractères, maj + min + chiffre)' })
  @IsStrongPassword()
  password!: string;

  @ApiProperty({ example: 'Awa Sow' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ApiPropertyOptional({ example: '+221 77 123 45 67' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ enum: UserRole, description: "Rôle de l'utilisateur" })
  @IsEnum(UserRole)
  role!: UserRole;
}
