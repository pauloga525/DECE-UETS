import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'nombre@uets.edu.ec' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'unaClaveSegura123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}
