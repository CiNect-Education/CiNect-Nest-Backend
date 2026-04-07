import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MoviesService } from './movies.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { MovieStatus, AgeRating } from '@prisma/client';

@ApiTags('movies')
@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Public()
  @Get()
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', enum: MovieStatus, required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'genre', required: false })
  @ApiQuery({ name: 'language', required: false })
  @ApiQuery({ name: 'ageRating', enum: AgeRating, required: false })
  @ApiQuery({ name: 'durationMin', required: false })
  @ApiQuery({ name: 'durationMax', required: false })
  @ApiQuery({ name: 'format', required: false })
  @ApiQuery({ name: 'sort', required: false })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: MovieStatus,
    @Query('search') search?: string,
    @Query('genre') genre?: string,
    @Query('language') language?: string,
    @Query('ageRating') ageRating?: AgeRating,
    @Query('durationMin') durationMin?: string,
    @Query('durationMax') durationMax?: string,
    @Query('format') format?: string,
    @Query('sort') sort?: string,
  ) {
    return this.moviesService.findAll({
      page,
      limit,
      status,
      search,
      genre,
      language,
      ageRating,
      durationMin: durationMin ? Number(durationMin) : undefined,
      durationMax: durationMax ? Number(durationMax) : undefined,
      format,
      sort,
    });
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.moviesService.findBySlug(slug);
  }

  @Public()
  @Get(':id/showtimes')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'city', required: false, description: 'Booking region slug or province code' })
  findShowtimes(
    @Param('id', ParseUuidPipe) id: string,
    @Query('date') date?: string,
    @Query('city') city?: string,
  ) {
    return this.moviesService.findShowtimesByMovie(id, date, city);
  }

  @Public()
  @Get(':id/reviews')
  findReviews(
    @Param('id', ParseUuidPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.moviesService.findReviews(id, page, limit);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/reviews')
  createReview(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.moviesService.createReview(id, userId, dto);
  }
}
