import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ShowtimesService } from './showtimes.service';
import { Public } from '../common/decorators/public.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { isUUID } from 'class-validator';

@ApiTags('showtimes')
@Controller('showtimes')
@Public()
export class ShowtimesController {
  constructor(private readonly showtimesService: ShowtimesService) {}

  @Get()
  @ApiQuery({ name: 'movieId', required: false })
  @ApiQuery({ name: 'cinemaId', required: false })
  @ApiQuery({ name: 'cinema', required: false, description: 'Cinema ID or slug alias' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD' })
  findAll(
    @Query('movieId') movieId?: string,
    @Query('cinemaId') cinemaId?: string,
    @Query('cinema') cinema?: string,
    @Query('city') city?: string,
    @Query('date') date?: string,
  ) {
    return this.showtimesService.findAll(
      this.buildFilters({ movieId, cinemaId, cinema, city, date }),
    );
  }

  @Get('search')
  @ApiQuery({ name: 'movieId', required: false })
  @ApiQuery({ name: 'cinemaId', required: false })
  @ApiQuery({ name: 'cinema', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'format', required: false })
  search(
    @Query('movieId') movieId?: string,
    @Query('cinemaId') cinemaId?: string,
    @Query('cinema') cinema?: string,
    @Query('city') city?: string,
    @Query('date') date?: string,
    @Query('format') format?: string,
  ) {
    return this.showtimesService.findAll(
      this.buildFilters({ movieId, cinemaId, cinema, city, date }),
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUuidPipe) id: string) {
    return this.showtimesService.findOne(id);
  }

  @Get(':id/seats')
  findSeats(@Param('id', ParseUuidPipe) id: string) {
    return this.showtimesService.findSeats(id);
  }

  private buildFilters(params: {
    movieId?: string;
    cinemaId?: string;
    cinema?: string;
    city?: string;
    date?: string;
  }) {
    let resolvedCinemaId = params.cinemaId;
    let cinemaSlug: string | undefined;

    if (!resolvedCinemaId && params.cinema) {
      if (isUUID(params.cinema, '4')) {
        resolvedCinemaId = params.cinema;
      } else {
        cinemaSlug = params.cinema;
      }
    }

    return {
      movieId: params.movieId,
      cinemaId: resolvedCinemaId,
      cinemaSlug,
      city: params.city,
      date: params.date,
    };
  }
}
