import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

@ApiTags('admin/analytics')
@ApiBearerAuth()
@Controller('admin/analytics')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('revenue')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getRevenue(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getRevenue(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('occupancy')
  @ApiQuery({ name: 'showtimeId', required: false })
  @ApiQuery({ name: 'cinemaId', required: false })
  getOccupancy(
    @Query('showtimeId') showtimeId?: string,
    @Query('cinemaId') cinemaId?: string,
  ) {
    return this.analyticsService.getOccupancy(showtimeId, cinemaId);
  }

  @Get('peak-hours')
  @ApiQuery({ name: 'cinemaId', required: false })
  @ApiQuery({ name: 'days', required: false })
  getPeakHours(
    @Query('cinemaId') cinemaId?: string,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getPeakHours(
      cinemaId,
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('top-movies')
  @ApiQuery({ name: 'limit', required: false })
  getTopMovies(@Query('limit') limit?: string) {
    return this.analyticsService.getTopMovies(limit ? parseInt(limit, 10) : 10);
  }
}
