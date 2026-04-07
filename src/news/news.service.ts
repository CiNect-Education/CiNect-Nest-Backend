import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageMeta } from '../common/dto/page-meta.dto';
import { NewsCategory, Prisma } from '@prisma/client';

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Normalize JSON list fields so the API always returns string[] (matches frontend contract). */
  private normalizeStringArray(v: Prisma.JsonValue | null | undefined): string[] | undefined {
    if (v === null || v === undefined) return undefined;
    if (Array.isArray(v)) return v.map((x) => String(x));
    return undefined;
  }

  private toArticleResponse(article: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    category: NewsCategory;
    imageUrl: string | null;
    author: string;
    tags: Prisma.JsonValue;
    relatedArticleIds: Prisma.JsonValue;
    publishedAt: Date;
    createdAt: Date;
  }) {
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      content: article.content,
      category: article.category,
      imageUrl: article.imageUrl ?? undefined,
      author: article.author,
      tags: this.normalizeStringArray(article.tags),
      relatedArticleIds: this.normalizeStringArray(article.relatedArticleIds),
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
    };
  }

  async findAll(page = 1, limit = 20, category?: NewsCategory, ids?: string[]) {
    if (ids !== undefined) {
      if (ids.length === 0) {
        const meta = new PageMeta(1, 0, 0);
        return { data: [], meta };
      }
      const rows = await this.prisma.newsArticle.findMany({
        where: { id: { in: ids } },
      });
      const order = new Map(ids.map((id, i) => [id, i]));
      rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      const meta = new PageMeta(1, rows.length, rows.length);
      return { data: rows.map((a) => this.toArticleResponse(a)), meta };
    }

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
    return { data: items.map((a) => this.toArticleResponse(a)), meta };
  }

  async findBySlug(slug: string) {
    const article = await this.prisma.newsArticle.findUnique({
      where: { slug },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    return this.toArticleResponse(article);
  }
}
