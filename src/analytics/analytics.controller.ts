import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

/**
 * Contract aligned with Spring {@code cinect-spring-backend} AdminController
 * ({@code range} / {@code from} / {@code to} as {@code YYYY-MM-DD}).
 */
@ApiTags('admin/analytics')
@ApiBearerAuth()
@Controller('admin/analytics')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('revenue')
  @ApiQuery({ name: 'range', required: false, description: '7d | 30d | 90d | custom' })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD (with custom range)' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD (with custom range)' })
  getRevenue(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getRevenueChart(range, from, to);
  }

  @Get('forecast')
  @ApiQuery({ name: 'range', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getForecast(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getForecastSeries(range, from, to);
  }

  @Get('occupancy')
  @ApiQuery({ name: 'range', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getOccupancy(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getOccupancyByCinemaDate(range, from, to);
  }

  @Get('customer-segments')
  getCustomerSegments() {
    return this.analyticsService.getCustomerSegmentsChart();
  }

  @Get('peak-hours')
  @ApiQuery({ name: 'range', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getPeakHours(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getPeakHoursSeries(range, from, to);
  }

  @Get('top-movies')
  @ApiQuery({ name: 'limit', required: false })
  getTopMovies(@Query('limit') limit?: string) {
    return this.analyticsService.getTopMovies(limit ? parseInt(limit, 10) : 10);
  }
}
