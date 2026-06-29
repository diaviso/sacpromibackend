import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/strong-password.decorator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token reçu par email' })
  @IsString()
  @MinLength(20)
  token!: string;

  @ApiProperty({ minLength: 12, description: 'Nouveau mot de passe (≥ 12 caractères, maj + min + chiffre)' })
  @IsStrongPassword()
  newPassword!: string;
}
