import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { PromotionsService } from './promotions.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('promotions')
@Controller('promotions')
@Public()
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  findAll() {
    return this.promotionsService.findAll();
  }

  @Get('active')
  @ApiQuery({ name: 'limit', required: false })
  findActive(@Query('limit') limit?: string) {
    return this.promotionsService.findActive(limit ? parseInt(limit, 10) : 8);
  }

  @Get('trending')
  findTrending() {
    return this.promotionsService.findTrending();
  }

  @Get(':code/validate')
  @ApiQuery({ name: 'amount', required: false })
  validate(
    @Param('code') code: string,
    @Query('amount') amount?: string,
  ) {
    return this.promotionsService.validate(
      code,
      amount ? parseFloat(amount) : undefined,
    );
  }
}
