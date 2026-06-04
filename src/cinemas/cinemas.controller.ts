import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CinemasService } from './cinemas.service';
import { Public } from '../common/decorators/public.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('cinemas')
@Controller('cinemas')
@Public()
export class CinemasController {
  constructor(private readonly cinemasService: CinemasService) {}

  @Get()
  findAll(@Query('city') city?: string) {
    return this.cinemasService.findAll(city);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.cinemasService.findBySlug(slug);
  }

  @Get(':id/rooms')
  findRooms(@Param('id', ParseUuidPipe) id: string) {
    return this.cinemasService.findRooms(id);
  }

  @Get(':id/showtimes')
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'movieId', required: false })
  findShowtimes(
    @Param('id', ParseUuidPipe) id: string,
    @Query('date') date?: string,
    @Query('movieId') movieId?: string,
  ) {
    return this.cinemasService.findShowtimes(id, date, movieId);
  }

  @Get(':id/ticket-prices')
  findTicketPrices(@Param('id', ParseUuidPipe) id: string) {
    return this.cinemasService.findTicketPrices(id);
  }
}
