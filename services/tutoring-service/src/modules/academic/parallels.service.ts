import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateParallelDto, UpdateParallelDto } from './dto/parallel.dto';

@Injectable()
export class ParallelsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateParallelDto) {
    try {
      return await this.prisma.parallel.create({ data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Este paralelo ya existe en este nivel');
      }
      throw e;
    }
  }

  findAll(levelId?: string) {
    return this.prisma.parallel.findMany({ where: levelId ? { levelId } : undefined, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const parallel = await this.prisma.parallel.findUnique({ where: { id } });
    if (!parallel) throw new NotFoundException('Paralelo no encontrado');
    return parallel;
  }

  async update(id: string, dto: UpdateParallelDto) {
    await this.findOne(id);
    return this.prisma.parallel.update({ where: { id }, data: dto });
  }
}
