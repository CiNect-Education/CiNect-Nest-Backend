import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProvincesService {
  constructor(private readonly prisma: PrismaService) {}

  findNew() {
    return this.prisma.provinceNew.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        code: true,
        nameVi: true,
        nameEn: true,
        sortOrder: true,
      },
    });
  }

  findLegacy() {
    return this.prisma.provinceLegacy.findMany({
      orderBy: { code: 'asc' },
      include: {
        provinceNew: {
          select: { code: true, nameVi: true, nameEn: true },
        },
      },
    });
  }
}
