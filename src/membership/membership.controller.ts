import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipService } from './membership.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('membership')
@Controller('membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Public()
  @Get('tiers')
  getTiers() {
    return this.membershipService.getTiers();
  }

  @ApiBearerAuth()
  @Get('profile')
  getProfile(@CurrentUser('id') userId: string) {
    return this.membershipService.getProfile(userId);
  }

  @ApiBearerAuth()
  @Get('points-history')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getPointsHistory(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.membershipService.getPointsHistory(userId, page, limit);
  }
}
