import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@sacpromi.sn' })
  @IsEmail({}, { message: "L'email doit être valide" })
  email!: string;

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  @MinLength(1, { message: 'Le mot de passe est obligatoire' })
  password!: string;
}
