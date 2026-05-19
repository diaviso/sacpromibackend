import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token reçu par email' })
  @IsString()
  @MinLength(20)
  token!: string;

  @ApiProperty({ minLength: 8, description: 'Nouveau mot de passe (≥ 8 caractères)' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  newPassword!: string;
}
