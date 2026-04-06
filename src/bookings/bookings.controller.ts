import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(userId, dto);
  }

  @Get()
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.bookingsService.findAll(userId, page, limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseUuidPipe) id: string, @CurrentUser('id') userId: string) {
    return this.bookingsService.findOne(id, userId);
  }

  @Post(':id/confirm')
  confirm(@Param('id', ParseUuidPipe) id: string, @CurrentUser('id') userId: string) {
    return this.bookingsService.confirm(id, userId);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUuidPipe) id: string, @CurrentUser('id') userId: string) {
    return this.bookingsService.cancel(id, userId);
  }

  @Post(':id/apply-promo')
  applyPromo(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { code: string },
  ) {
    return this.bookingsService.applyPromo(id, userId, body.code);
  }

  @Post(':id/apply-points')
  applyPoints(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { points: number },
  ) {
    return this.bookingsService.applyPoints(id, userId, body.points);
  }

  @Post(':id/apply-gift-card')
  applyGiftCard(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { code: string },
  ) {
    return this.bookingsService.applyGiftCard(id, userId, body.code);
  }
}
