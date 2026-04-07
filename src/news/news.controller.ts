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
  @ApiQuery({
    name: 'ids',
    required: false,
    description: 'Comma-separated article UUIDs (e.g. related articles on detail page)',
  })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: NewsCategory,
    @Query('ids') idsCsv?: string,
  ) {
    let ids: string[] | undefined;
    if (idsCsv != null && idsCsv.trim() !== '') {
      ids = idsCsv
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s));
    }
    return this.newsService.findAll(page, limit, category, ids);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.newsService.findBySlug(slug);
  }
}
