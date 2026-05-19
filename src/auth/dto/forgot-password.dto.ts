import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@sacpromi.sn' })
  @IsEmail({}, { message: "L'email doit être valide" })
  email!: string;
}
