import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { NewsService } from './news.service';
import { Public } from '../common/decorators/public.decorator';
import { NewsCategory } from '@prisma/client';

@ApiTags('news')
@Controller('news')
@Public()
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'category', enum: NewsCategory, required: false })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: NewsCategory,
  ) {
    return this.newsService.findAll(page, limit, category);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.newsService.findBySlug(slug);
  }
}
