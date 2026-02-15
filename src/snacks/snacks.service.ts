import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SnacksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.snack.findMany({
      where: { isActive: true },
    });
  }

  async findByCinema(cinemaId: string) {
    return this.prisma.snack.findMany({
      where: {
        isActive: true,
        OR: [{ cinemaId: null }, { cinemaId }],
      },
    });
  }
}
