import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('coupons')
@ApiBearerAuth()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.couponsService.getUserCoupons(userId);
  }

  @Post(':code/validate')
  validate(
    @Param('code') code: string,
    @Query('subtotal') subtotal: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.couponsService.validate(code, parseFloat(subtotal || '0'), userId);
  }
}
