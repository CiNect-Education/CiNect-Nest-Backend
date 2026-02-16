import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async findAll() {
    return this.prisma.pricingRule.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
