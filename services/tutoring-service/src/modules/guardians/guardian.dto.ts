import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() || undefined : value;

export class UpdateGuardianDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Cédula' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  identification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimLower)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class LinkGuardianDto extends UpdateGuardianDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare firstName: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare lastName: string;

  @ApiPropertyOptional({ example: 'Madre' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  relationship?: string;

  @ApiPropertyOptional({ description: 'Si recibe los correos de tutorías (por defecto sí)' })
  @IsOptional()
  @IsBoolean()
  notifications?: boolean;
}
