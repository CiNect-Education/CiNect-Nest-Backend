import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ShowtimesService } from './showtimes.service';
import { Public } from '../common/decorators/public.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('showtimes')
@Controller('showtimes')
@Public()
export class ShowtimesController {
  constructor(private readonly showtimesService: ShowtimesService) {}

  @Get()
  @ApiQuery({ name: 'movieId', required: false })
  @ApiQuery({ name: 'cinemaId', required: false })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD' })
  findAll(
    @Query('movieId') movieId?: string,
    @Query('cinemaId') cinemaId?: string,
    @Query('date') date?: string,
  ) {
    return this.showtimesService.findAll({ movieId, cinemaId, date });
  }

  @Get(':id')
  findOne(@Param('id', ParseUuidPipe) id: string) {
    return this.showtimesService.findOne(id);
  }

  @Get(':id/seats')
  findSeats(@Param('id', ParseUuidPipe) id: string) {
    return this.showtimesService.findSeats(id);
  }
}
