import { Module } from '@nestjs/common';
import { GuardiansController } from './guardians.controller';

@Module({ controllers: [GuardiansController] })
export class GuardiansModule {}
