import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageMeta } from '../common/dto/page-meta.dto';
import { NewsCategory } from '@prisma/client';

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, limit = 20, category?: NewsCategory) {
    const skip = (page - 1) * limit;
    const where = category ? { category } : {};
    const [items, total] = await Promise.all([
      this.prisma.newsArticle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.newsArticle.count({ where }),
    ]);
    const meta = new PageMeta(page, limit, total);
    return { data: items, meta };
  }

  async findBySlug(slug: string) {
    const article = await this.prisma.newsArticle.findUnique({
      where: { slug },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    return article;
  }
}
