import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role, ROLES } from '../../../domain/entities/user.entity';

export class GoogleLoginDto {
  @ApiProperty({ description: 'ID token (JWT) devuelto por Google Identity Services' })
  @IsString()
  @MinLength(20)
  credential!: string;
}

export class DevLoginDto {
  @ApiProperty({ example: 'dece@uets.edu.ec' })
  @IsEmail()
  email!: string;
}

export class CreateUserDto {
  @ApiProperty({ example: 'nombre.apellido@uets.edu.ec' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;
}
