import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLevelDto, UpdateLevelDto } from './dto/level.dto';

@Injectable()
export class LevelsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateLevelDto) {
    try {
      return await this.prisma.level.create({ data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un nivel con ese nombre en este período');
      }
      throw e;
    }
  }

  findAll(academicPeriodId?: string) {
    return this.prisma.level.findMany({
      where: academicPeriodId ? { academicPeriodId } : undefined,
      include: { parallels: true },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: string) {
    const level = await this.prisma.level.findUnique({
      where: { id },
      include: { parallels: true },
    });
    if (!level) throw new NotFoundException('Nivel no encontrado');
    return level;
  }

  async update(id: string, dto: UpdateLevelDto) {
    await this.findOne(id);
    return this.prisma.level.update({ where: { id }, data: dto });
  }
}
