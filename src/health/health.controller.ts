import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  async check() {
    let dbStatus = 'UP';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'DOWN';
    }

    const status = dbStatus === 'UP' ? 'UP' : 'DOWN';

    return {
      status,
      timestamp: new Date().toISOString(),
      components: {
        database: { status: dbStatus },
        application: { status: 'UP' },
      },
    };
  }
}
