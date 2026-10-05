import { Module } from '@nestjs/common';
import { AnimatorController } from './animator.controller';

@Module({ controllers: [AnimatorController] })
export class AnimatorModule {}
