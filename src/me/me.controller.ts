import { Controller, Get, Post, Body, Query, ParseIntPipe, DefaultValuePipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couponsService: CouponsService,
  ) {}

  @Get('coupons')
  async myCoupons(@CurrentUser('id') userId: string) {
    return this.couponsService.getUserCoupons(userId);
  }

  @Post('coupons/redeem')
  async redeemCoupon(@CurrentUser('id') userId: string, @Body() body: { code: string }) {
    return this.couponsService.redeem(body.code, userId);
  }

  @Get('gifts')
  async myGifts(@CurrentUser('id') userId: string) {
    const transactions = await this.prisma.giftTransaction.findMany({
      where: { buyerId: userId },
      include: { giftCard: true },
    });
    return transactions.map((tx) => tx.giftCard);
  }

  @Get('points/history')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async pointsHistory(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.pointsHistory.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.pointsHistory.count({ where: { userId } }),
    ]);
    return { data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
