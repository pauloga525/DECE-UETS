import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAcademicPeriodDto, UpdateAcademicPeriodDto } from './dto/academic-period.dto';

@Injectable()
export class AcademicPeriodsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateAcademicPeriodDto) {
    return this.prisma.academicPeriod.create({
      data: { ...dto, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) },
    });
  }

  findAll() {
    return this.prisma.academicPeriod.findMany({ orderBy: { startDate: 'desc' } });
  }

  async findOne(id: string) {
    const period = await this.prisma.academicPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('Período académico no encontrado');
    return period;
  }

  async update(id: string, dto: UpdateAcademicPeriodDto) {
    await this.findOne(id);
    return this.prisma.academicPeriod.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }
}
