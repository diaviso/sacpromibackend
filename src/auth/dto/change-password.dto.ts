import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/strong-password.decorator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Mot de passe actuel' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ description: 'Nouveau mot de passe (≥ 12 caractères, maj + min + chiffre)', minLength: 12 })
  @IsStrongPassword()
  newPassword!: string;
}
